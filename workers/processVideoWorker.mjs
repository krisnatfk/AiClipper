import { createClient } from '@libsql/client';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

function loadDotEnv() {
  return readFile(path.resolve(process.cwd(), '.env'), 'utf8')
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...valueParts] = trimmed.split('=');
        if (!process.env[key]) process.env[key] = valueParts.join('=');
      }
    })
    .catch(() => {});
}

await loadDotEnv();

const databaseUrl = process.env.DATABASE_URL || 'file:local.db';
const db = createClient({ url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const once = process.argv.includes('--once');

function now() {
  return new Date().toISOString();
}

function resolveWorkspacePath(filePath) {
  const workspace = process.cwd();
  const absolutePath = path.resolve(workspace, filePath);
  if (!absolutePath.toLowerCase().startsWith(workspace.toLowerCase())) {
    throw new Error('Refusing to process a file path outside the workspace.');
  }
  return absolutePath;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

async function log(projectId, jobId, step, message, level = 'info', meta = undefined) {
  await db.execute({
    sql: `INSERT INTO processing_logs (project_id, job_id, level, step, message, meta)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [projectId, jobId, level, step, message, meta ? JSON.stringify(meta) : null],
  });
}

async function updateProject(projectId, values) {
  const keys = Object.keys(values);
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  await db.execute({
    sql: `UPDATE projects SET ${assignments}, updated_at = ? WHERE project_id = ?`,
    args: [...keys.map((key) => values[key]), now(), projectId],
  });
}

async function getQueuedJob() {
  const result = await db.execute({
    sql: `SELECT * FROM processing_jobs
          WHERE status = 'QUEUED' AND type IN ('PROCESS_VIDEO', 'IMPORT_ONLY', 'RENDER_CLIP')
          ORDER BY priority DESC, created_at ASC
          LIMIT 1`,
    args: [],
  });

  return result.rows[0];
}

async function claimJob(job) {
  const result = await db.execute({
    sql: `UPDATE processing_jobs
          SET status = 'PROCESSING', attempts = attempts + 1, started_at = ?, updated_at = ?
          WHERE job_id = ? AND status = 'QUEUED'`,
    args: [now(), now(), job.job_id],
  });

  return result.rowsAffected > 0;
}

async function completeJob(jobId, result) {
  await db.execute({
    sql: `UPDATE processing_jobs
          SET status = 'COMPLETED', result = ?, progress = 100, completed_at = ?, updated_at = ?
          WHERE job_id = ?`,
    args: [JSON.stringify(result), now(), now(), jobId],
  });
}

async function failJob(job, error) {
  await db.execute({
    sql: `UPDATE processing_jobs
          SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
              error_message = ?, updated_at = ?
          WHERE job_id = ?`,
    args: [error.message, now(), job.job_id],
  });

  if (job.attempts + 1 >= job.max_attempts) {
    await updateProject(job.project_id, {
      status: 'FAILED',
      stage: 'FAILED',
      error_message: error.message,
      current_step: 'Processing worker failed.',
    });
  }

  await log(job.project_id, job.job_id, 'ERROR', error.message, 'error');
}

async function probeVideo(sourcePath) {
  const { stdout } = await runCommand(ffprobePath, [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    sourcePath,
  ]);

  const metadata = JSON.parse(stdout);
  const videoStream = metadata.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = metadata.streams?.find((stream) => stream.codec_type === 'audio');

  if (!videoStream) throw new Error('Video stream could not be found.');
  if (!audioStream) throw new Error('Video does not contain an audio stream.');

  return {
    metadata,
    durationSeconds: Math.round(Number(metadata.format?.duration || videoStream.duration || 0)),
    width: Number(videoStream.width || 0),
    height: Number(videoStream.height || 0),
    fps: videoStream.avg_frame_rate || videoStream.r_frame_rate || null,
    codec: videoStream.codec_name || null,
  };
}

async function extractAudio(sourcePath, projectId) {
  const tempRoot = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp');
  const projectTempDir = path.join(tempRoot, projectId);
  await mkdir(projectTempDir, { recursive: true });

  const audioPath = path.join(projectTempDir, 'audio.wav');
  await runCommand(ffmpegPath, [
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'wav',
    audioPath,
  ]);

  return path.relative(process.cwd(), audioPath);
}

async function transcribeAudio(audioRelativePath, project) {
  const audioPath = resolveWorkspacePath(audioRelativePath);
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'transcribe_faster_whisper.py');
  const pythonPath = process.env.PYTHON_PATH || 'python';
  const { stdout } = await runCommand(pythonPath, [
    scriptPath,
    '--audio',
    audioPath,
    '--model',
    process.env.WHISPER_MODEL || 'small',
    '--device',
    process.env.WHISPER_DEVICE || 'cpu',
    '--language',
    project.language || 'auto',
  ]);

  return JSON.parse(stdout);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function getSegmentText(segments, startSec, endSec) {
  return segments
    .filter((segment) => Number(segment.end) >= startSec && Number(segment.start) <= endSec)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHashtags(hashtags) {
  if (Array.isArray(hashtags)) return hashtags.map(String).filter(Boolean).slice(0, 8);
  if (typeof hashtags === 'string') return hashtags.split(/\s+/).filter((tag) => tag.startsWith('#')).slice(0, 8);
  return ['#shorts', '#autoclip'];
}

function validateClipPlans(rawPlans, project, durationSeconds) {
  const minDuration = Number(project.clip_min_seconds || 30);
  const maxDuration = Number(project.clip_max_seconds || 90);
  const plans = [];

  for (const raw of rawPlans) {
    const startSec = clampNumber(raw.startSec ?? raw.start_sec, 0, Math.max(0, durationSeconds - 1));
    const wantedEnd = raw.endSec ?? raw.end_sec ?? startSec + maxDuration;
    const endSec = clampNumber(wantedEnd, startSec + Math.min(20, minDuration), Math.min(durationSeconds, startSec + maxDuration));
    const duration = endSec - startSec;
    if (duration < Math.min(20, minDuration) || startSec >= endSec) continue;

    plans.push({
      startSec: Math.round(startSec),
      endSec: Math.round(endSec),
      title: String(raw.title || `Clip ${plans.length + 1}`).slice(0, 120),
      hookText: String(raw.hookText || raw.hook_text || raw.title || 'Watch this moment').slice(0, 140),
      caption: String(raw.caption || raw.reason || '').slice(0, 600),
      hashtags: normalizeHashtags(raw.hashtags),
      score: Math.round(clampNumber(raw.score ?? 75, 0, 100)),
      scoreBreakdown: raw.scoreBreakdown || raw.score_breakdown || {
        hook: 75,
        clarity: 75,
        emotion: 70,
        value: 75,
        shareability: 72,
      },
      reason: String(raw.reason || 'Selected from transcript momentum and topic density.').slice(0, 500),
    });
  }

  return plans.slice(0, Number(project.clip_count_requested || 5));
}

function fallbackClipPlans(transcript, project, durationSeconds) {
  const segments = transcript.segments || [];
  const clipCount = Number(project.clip_count_requested || 5);
  const minDuration = Number(project.clip_min_seconds || 30);
  const maxDuration = Number(project.clip_max_seconds || 90);
  const targetDuration = Math.min(maxDuration, Math.max(minDuration, 60));
  const usableSegments = segments.filter((segment) => String(segment.text || '').trim().length > 20);
  const plans = [];
  const stride = Math.max(1, Math.floor(usableSegments.length / Math.max(clipCount, 1)));

  for (let i = 0; i < clipCount; i += 1) {
    const anchor = usableSegments[i * stride] || usableSegments[i] || segments[0];
    if (!anchor) break;

    const startSec = Math.max(0, Math.floor(Number(anchor.start || 0)));
    const endSec = Math.min(durationSeconds, startSec + targetDuration);
    const text = getSegmentText(segments, startSec, endSec);
    const titleSeed = text.split(/[.!?]/)[0]?.trim() || `Highlight ${i + 1}`;
    const title = titleSeed.length > 72 ? `${titleSeed.slice(0, 69)}...` : titleSeed;

    plans.push({
      startSec,
      endSec,
      title: title || `Highlight ${i + 1}`,
      hookText: title || 'This is the key moment',
      caption: text.slice(0, 420),
      hashtags: ['#shorts', '#news', '#autoclip'],
      score: Math.max(68, 86 - i * 3),
      scoreBreakdown: {
        hook: 72,
        clarity: 76,
        emotion: 70,
        value: 78,
        shareability: 74,
      },
      reason: 'Fallback plan generated from transcript chunks because AI planning is not configured or did not return valid JSON.',
    });
  }

  return validateClipPlans(plans, project, durationSeconds);
}

/**
 * Build the Gemini prompt based on the selected clip model + custom prompt.
 *
 * Two independent systems control clip output:
 * 1. Clip Model / Prompt  → selects WHICH moments to clip (content, from transcript).
 * 2. Auto Subject Tracking → controls HOW the crop follows the person visually.
 *    This is handled in renderClip via track_subject.py, NOT here.
 *
 * So "Custom Prompt Mode" + a prompt like "Compile all the hilarious moments"
 * tells the AI to find funny content — the visual framing (following the
 * person left→right) is handled automatically by subject tracking at render.
 */
function buildGeminiPrompt(transcript, project) {
  const compactSegments = (transcript.segments || [])
    .map((segment) => `[${Math.round(Number(segment.start))}-${Math.round(Number(segment.end))}] ${segment.text}`)
    .join('\n')
    .slice(0, 45000);

  const clipCount = Number(project.clip_count_requested || 5);
  const minDur = Number(project.clip_min_seconds || 30);
  const maxDur = Number(project.clip_max_seconds || 90);
  const videoDur = Number(project.duration_seconds || 0);
  const genre = project.genre || 'Auto';
  const model = project.model || 'Auto';
  const customPrompt = (project.specific_moments_prompt || '').trim();
  const autoHook = project.auto_hook_enabled !== false;

  // Base system instruction varies by clip model (spec Section C.5).
  let modelInstruction = '';
  switch (model) {
    case 'Fast Mode':
      modelInstruction = 'Focus on the most impactful moments quickly. Prioritize speed — pick moments with the strongest opening hooks.';
      break;
    case 'Smart Mode':
      modelInstruction = 'Analyze the transcript deeply for storytelling, value, and emotional arcs. Select moments that would perform well as standalone short clips.';
      break;
    case 'Highlight Mode':
      modelInstruction = 'Focus on highlight reels — exciting, surprising, or impactful moments. These should feel like "best of" compilation segments.';
      break;
    case 'Podcast Mode':
      modelInstruction = 'This is podcast content. Focus on insightful quotes, controversial takes, deep explanations, or humorous exchanges. Avoid dead air and tangents.';
      break;
    case 'News Mode':
      modelInstruction = 'This is news content. Focus on key information, breaking points, quotable statements, and clear explanations. Prioritize clarity and newsworthiness.';
      break;
    case 'Gaming Mode':
      modelInstruction = 'This is gaming content. Focus on clutch plays, funny reactions, rage moments, epic comebacks, or impressive skill displays.';
      break;
    case 'Custom Prompt Mode':
      // The user's custom prompt IS the primary instruction.
      modelInstruction = customPrompt || 'Find the most interesting, emotional, controversial, funny, or informative moments from this video and turn them into short viral clips.';
      break;
    case 'Auto':
    default:
      modelInstruction = 'Find the most interesting, emotional, controversial, funny, or informative moments from this video and turn them into short viral clips.';
      break;
  }

  // If the user provided a specific moments prompt AND it's not Custom Prompt
  // Mode (where the prompt IS the instruction), append it as extra guidance.
  let specificGuidance = '';
  if (customPrompt && model !== 'Custom Prompt Mode') {
    specificGuidation = `\n\nAdditional user instruction (prioritize moments matching this): ${customPrompt}`;
  }

  const hookInstruction = autoHook
    ? 'Each clip must have a compelling hookText — a short attention-grabbing phrase for the first 3-5 seconds.'
    : 'hookText can be empty or minimal — auto hook is disabled.';

  return `You are an expert short-form video editor specializing in ${genre} content. ${modelInstruction}${specificGuidance}

${hookInstruction} Avoid starting in the middle of a sentence. Prioritize moments with strong hooks, useful information, emotion, conflict, surprise, or clear storytelling.

Rules:
- Return ${clipCount} clips.
- Each clip duration must be between ${minDur} and ${maxDur} seconds.
- Timestamps must be inside the video duration: ${videoDur} seconds.
- Genre: ${genre}
- Output JSON shape: {"clips":[{"startSec":0,"endSec":60,"title":"","hookText":"","caption":"","hashtags":["#shorts"],"score":80,"scoreBreakdown":{"hook":80,"clarity":80,"emotion":80,"value":80,"shareability":80},"reason":""}]}

Transcript:
${compactSegments}`;
}

async function generateGeminiPlans(transcript, project) {
  if (!process.env.GEMINI_API_KEY) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildGeminiPrompt(transcript, project) }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini planning failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty planning response.');
  return JSON.parse(text);
}

async function planClips(transcript, project, jobId) {
  await updateProject(project.project_id, {
    status: 'ANALYZING',
    stage: 'ANALYZING',
    progress: 60,
    current_step: 'Finding highlight moments.',
  });

  let rawResponse = null;
  let plans = [];

  try {
    rawResponse = await generateGeminiPlans(transcript, project);
    if (rawResponse?.clips) {
      plans = validateClipPlans(rawResponse.clips, project, Number(project.duration_seconds || transcript.duration || 0));
      await log(project.project_id, jobId, 'ANALYZING', 'Gemini generated clip plans.', 'info', { clips: plans.length });
    }
  } catch (error) {
    await log(project.project_id, jobId, 'ANALYZING', error.message, 'warn');
  }

  if (plans.length === 0) {
    plans = fallbackClipPlans(transcript, project, Number(project.duration_seconds || transcript.duration || 0));
    rawResponse = { fallback: true, clips: plans };
    await log(project.project_id, jobId, 'ANALYZING', 'Generated fallback clip plans from transcript chunks.', 'info', {
      clips: plans.length,
    });
  }

  if (plans.length === 0) throw new Error('AI could not find strong moments and fallback planning produced no clips.');

  await updateProject(project.project_id, {
    status: 'PLANNING_CLIPS',
    stage: 'PLANNING_CLIPS',
    progress: 70,
    current_step: 'Saving validated clip plans.',
  });

  await db.execute({ sql: 'DELETE FROM clip_plans WHERE project_id = ?', args: [project.project_id] });
  await db.execute({ sql: 'DELETE FROM clips WHERE project_id = ?', args: [project.project_id] });

  const savedPlans = [];
  for (const plan of plans) {
    const clipPlanId = `plan_${randomUUID()}`;
    await db.execute({
      sql: `INSERT INTO clip_plans
            (clip_plan_id, project_id, start_sec, end_sec, title, hook_text, caption, hashtags, score, score_breakdown, reason, ai_raw_response, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        clipPlanId,
        project.project_id,
        plan.startSec,
        plan.endSec,
        plan.title,
        plan.hookText,
        plan.caption,
        JSON.stringify(plan.hashtags),
        plan.score,
        JSON.stringify(plan.scoreBreakdown),
        plan.reason,
        JSON.stringify(rawResponse),
        'PLANNED',
      ],
    });
    savedPlans.push({ ...plan, clipPlanId });
  }

  return savedPlans;
}

function srtTimestamp(seconds) {
  const safe = Math.max(0, Number(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function wrapSubtitle(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(.{1,42})(\s+|$)/g, '$1\n')
    .trim();
}

async function writeSubtitleFile(project, plan, segments, clipIndex) {
  const tempRoot = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp');
  const projectTempDir = path.join(tempRoot, project.project_id);
  await mkdir(projectTempDir, { recursive: true });
  const subtitlePath = path.join(projectTempDir, `clip_${clipIndex + 1}.srt`);

  const overlapping = segments.filter((segment) => Number(segment.end) >= plan.startSec && Number(segment.start) <= plan.endSec);
  const source = overlapping.length > 0 ? overlapping : [{ start: plan.startSec, end: Math.min(plan.endSec, plan.startSec + 5), text: plan.hookText }];
  const body = source
    .map((segment, index) => {
      const start = Math.max(0, Number(segment.start) - plan.startSec);
      const end = Math.min(plan.endSec - plan.startSec, Math.max(start + 0.5, Number(segment.end) - plan.startSec));
      return `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${wrapSubtitle(segment.text)}\n`;
    })
    .join('\n');

  await writeFile(subtitlePath, body, 'utf8');
  return path.relative(process.cwd(), subtitlePath);
}

function ffmpegFilterPath(relativePath) {
  return relativePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function escapeDrawtext(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .slice(0, 120);
}

/**
 * Run the Python subject tracker to get dynamic crop keyframes (spec F
 * auto face/object tracking). Returns null if tracking is disabled or fails.
 */
async function trackSubject(sourcePath, plan, aspectRatio) {
  // Only track for portrait crops where center-crop loses the subject.
  if (aspectRatio === '16:9') return null;

  const scriptPath = path.resolve(process.cwd(), 'scripts', 'track_subject.py');
  const pythonPath = process.env.PYTHON_PATH || 'python';
  const mode = plan.reframeMode || 'face-center-crop';

  try {
    const { stdout } = await runCommand(pythonPath, [
      scriptPath,
      '--input', sourcePath,
      '--start', String(plan.startSec),
      '--end', String(plan.endSec),
      '--aspect', aspectRatio,
      '--mode', mode,
      '--sample-interval', '0.5',
      '--max-samples', '120',
    ]);

    const data = JSON.parse(stdout);
    if (data.error) return null;
    return data;
  } catch (error) {
    // Tracking is best-effort — fall back to center crop.
    return null;
  }
}

/**
 * Build a dynamic crop filter that follows the subject across keyframes.
 *
 * Instead of building a single huge arithmetic expression with nested if()
 * (which breaks FFmpeg's filtergraph parser on the commas inside lt(t,...)),
 * we generate a sendcmd command file and chain it before the crop filter.
 * sendcmd updates crop w/h/x/y at each keyframe time, which is the
 * FFmpeg-native way to animate filter parameters.
 *
 * Returns a filtergraph prefix like:
 *   sendcmd=f=cmd.txt,crop=405:720:x0:y0
 * The caller appends the scaling step, e.g.:
 *   ,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920
 */
function buildDynamicCropFilter(tracking, cmdFilePath) {
  if (!tracking || tracking.mode === 'fit-blur' || !tracking.tracked || !tracking.keyframes || tracking.keyframes.length === 0) {
    return null;
  }

  const kfs = tracking.keyframes;
  const outW = tracking.cropW;
  const outH = tracking.cropH;
  const first = kfs[0];

  const lines = [];
  for (const kf of kfs) {
    lines.push(`${kf.t} crop w ${Math.round(kf.w)},`);
    lines.push(`     crop h ${Math.round(kf.h)},`);
    lines.push(`     crop x ${Math.round(kf.x)},`);
    lines.push(`     crop y ${Math.round(kf.y)};`);
  }

  mkdirSync(path.dirname(cmdFilePath), { recursive: true });
  writeFileSync(cmdFilePath, lines.join('\n'), 'utf8');

  const safePath = ffmpegFilterPath(cmdFilePath);
  const x0 = Math.round(first.x);
  const y0 = Math.round(first.y);
  return `sendcmd=f=${safePath},crop=${outW}:${outH}:${x0}:${y0}`;
}

function buildFitBlurFilter(outputLabel = 'v_crop', outputWidth = 1080, outputHeight = 1920) {
  return [
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight},gblur=sigma=28[bg]`,
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[${outputLabel}]`,
  ].join(';');
}

function resolveReframeMode(layoutConfig, project) {
  if (layoutConfig?.reframeMode) return layoutConfig.reframeMode;
  if (layoutConfig?.mode === 'fit') return 'fit-blur';
  if (layoutConfig?.mode === 'crop') return 'manual-crop';
  if (project.aspect_ratio === '16:9') return 'fit-blur';
  return 'face-center-crop';
}

/**
 * Compute adaptive caption/hook safe-areas based on the detected subject's
 * median vertical position inside the output frame. If the subject is high,
 * move the hook down so it does not cover the face. If the subject is low,
 * shrink the caption and push it up from the bottom so it does not cover the
 * face/body.
 */
function computeSafeAreas(tracking) {
  const defaults = {
    captionFontSize: 24,
    captionMarginV: 20,
    captionAlignment: 2,
    hookYExpr: '(h-text_h)/4',
  };

  if (!tracking || !tracking.selectedSubjects || tracking.selectedSubjects.length === 0) {
    return defaults;
  }

  const subjects = tracking.selectedSubjects;
  const crops = tracking.cropBoxes || [];
  const outputHeight = tracking.outputHeight || 1920;

  const ys = [];
  for (let i = 0; i < subjects.length; i += 1) {
    const subject = subjects[i];
    if (!subject) continue;
    const crop = crops[i] || crops[crops.length - 1] || null;
    if (!crop) continue;
    const subjectCenterY = subject.y + subject.height / 2;
    const relY = (subjectCenterY - crop.y) / crop.height;
    ys.push(relY * outputHeight);
  }

  if (ys.length === 0) return defaults;

  ys.sort((a, b) => a - b);
  const medianY = ys[Math.floor(ys.length / 2)];

  const result = { ...defaults };
  // Subject is in the top 25% of the frame → move hook to the lower area.
  if (medianY < outputHeight * 0.25) {
    result.hookYExpr = '(h-text_h)*0.72';
  }
  // Subject is in the lower 55% where captions normally sit → shrink caption
  // and push it upward from the bottom edge.
  if (medianY > outputHeight * 0.55) {
    result.captionFontSize = 20;
    result.captionMarginV = 140;
  }

  return result;
}

async function renderClip(sourcePath, project, plan, transcript, index) {
  const outputRoot = path.resolve(process.cwd(), process.env.LOCAL_OUTPUT_DIR || './storage/outputs');
  const projectOutputDir = path.join(outputRoot, project.project_id);
  await mkdir(projectOutputDir, { recursive: true });

  const clipId = `clip_${randomUUID()}`;
  const outputPath = path.join(projectOutputDir, `${clipId}.mp4`);
  const thumbnailPath = path.join(projectOutputDir, `${clipId}.jpg`);
  const subtitleRelativePath = await writeSubtitleFile(project, plan, transcript.segments || [], index);
  const subtitleAbsPath = ffmpegFilterPath(path.resolve(process.cwd(), subtitleRelativePath));
  const duration = Math.max(1, plan.endSec - plan.startSec);
  
  // Fetch Editor Config if exists
  const editResult = await db.execute({
    sql: 'SELECT * FROM clip_edits WHERE clip_id = ? ORDER BY created_at DESC LIMIT 1',
    args: [plan.clipPlanId],
  });
  const editRow = editResult.rows[0];
  
  let layoutMode = 'full';
  let layoutConfig = {};
  let hookConfig = null;
  
  if (editRow) {
    layoutConfig = parseJsonField(editRow.layout_config, {});
    layoutMode = layoutConfig.mode || 'full';
    hookConfig = parseJsonField(editRow.hook_config, null);
  }
  const reframeMode = resolveReframeMode(layoutConfig, project);

  let filterComplex = '';
  
  if (layoutMode === 'split-top-bottom') {
    // MVP Split: stack top and bottom
    filterComplex = `[0:v]split=2[top][bottom];[top]crop=iw:ih/2:0:0,scale=1080:960[t];[bottom]crop=iw:ih/2:0:ih/2,scale=1080:960[b];[t][b]vstack=inputs=2[v_split];`;
    filterComplex += `[v_split]subtitles='${subtitleAbsPath}':force_style='FontSize=24'[v_sub]`;
  } else {
    // Default 9:16 crop — with auto subject tracking (spec F).
    // Detect the subject's position and follow it with a dynamic crop,
    // so a person on the left/right of a landscape video stays centered
    // instead of being cut off by a static center-crop.
    const tracking = reframeMode === 'fit-blur'
      ? null
      : await trackSubject(sourcePath, { ...plan, reframeMode }, project.aspect_ratio || '9:16');
    const projectTempDir = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp', project.project_id);
    const cmdFilePath = path.join(projectTempDir, `${clipId}_crop_cmds.txt`);
    const dynCrop = buildDynamicCropFilter(tracking, cmdFilePath);
    const safeAreas = computeSafeAreas(tracking);

    if (dynCrop) {
      // Dynamic crop following the subject via sendcmd keyframe animation.
      filterComplex = `[0:v]${dynCrop},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v_crop];`;
      await log(project.project_id, 'render', 'RENDERING', `Subject tracking applied: ${tracking.keyframes.length} keyframes.`, 'info');
    } else {
      // Safe fallback: keep the full source visible over a blurred 9:16 fill.
      filterComplex = `${buildFitBlurFilter('v_crop')};`;
    }
    filterComplex += `[v_crop]subtitles='${subtitleAbsPath}':force_style='FontSize=${safeAreas.captionFontSize},MarginV=${safeAreas.captionMarginV},Alignment=${safeAreas.captionAlignment}'[v_sub]`;
  }

  if (hookConfig && hookConfig.text) {
    const escText = escapeDrawtext(hookConfig.text);
    const start = hookConfig.startTime || 0;
    const end = hookConfig.endTime || 4;
    filterComplex += `;[v_sub]drawtext=text='${escText}':fontcolor=${hookConfig.textColor.replace('#','')}:fontsize=${hookConfig.fontSize}:x=(w-text_w)/2:y=${safeAreas.hookYExpr}:enable='between(t,${start},${end})'[v_out]`;
  } else {
    filterComplex += `;[v_sub]copy[v_out]`;
  }

  const baseArgs = [
    '-y',
    '-ss', String(plan.startSec),
    '-i', sourcePath,
    '-t', String(duration),
    '-filter_complex', filterComplex,
    '-map', '[v_out]',
    '-map', '0:a',
    '-c:v', 'h264_nvenc',
    '-preset', 'p4',
    '-cq', '24',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ];

  try {
    await runCommand(ffmpegPath, baseArgs);
  } catch (error) {
    const cpuArgs = [...baseArgs];
    const codecIndex = cpuArgs.indexOf('h264_nvenc');
    if (codecIndex !== -1) {
      cpuArgs[codecIndex] = 'libx264';
      const presetIndex = cpuArgs.indexOf('p4');
      if (presetIndex !== -1) cpuArgs[presetIndex] = 'veryfast';
    }
    await runCommand(ffmpegPath, cpuArgs);
  }

  await runCommand(ffmpegPath, [
    '-y',
    '-ss',
    String(Math.max(0, plan.startSec + 1)),
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    thumbnailPath,
  ]);

  const outputRelativePath = path.relative(process.cwd(), outputPath);
  const thumbnailRelativePath = path.relative(process.cwd(), thumbnailPath);
  const fileStat = await stat(outputPath);

  await db.execute({
    sql: `INSERT INTO clips
          (clip_id, opus_clip_id, project_id, clip_plan_id, title, hook_text, caption, hashtags, start_sec, end_sec, duration_seconds, duration_ms, score,
           output_file_path, output_storage_url, uri_for_preview, uri_for_export, thumbnail_file_path, thumbnail_storage_url, subtitle_file_path, render_pref, status, storage_used, time_ranges)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      clipId,
      clipId,
      project.project_id,
      plan.clipPlanId,
      plan.title,
      plan.hookText,
      plan.caption,
      plan.hashtags.join(' '),
      plan.startSec,
      plan.endSec,
      duration,
      duration * 1000,
      plan.score,
      outputRelativePath,
      `/api/clips/${clipId}/video`,
      `/api/clips/${clipId}/video`,
      `/api/clips/${clipId}/video`,
      thumbnailRelativePath,
      `/api/clips/${clipId}/thumbnail`,
      subtitleRelativePath,
      JSON.stringify({
        aspectRatio: project.aspect_ratio || '9:16',
        cropMode: reframeMode,
        fallbackMode: 'fit-blur',
        encoder: 'h264_nvenc_or_libx264',
      }),
      'COMPLETED',
      fileStat.size,
      JSON.stringify([[plan.startSec, plan.endSec]]),
    ],
  });

  return { clipId, outputRelativePath, thumbnailRelativePath };
}

async function renderClips(sourcePath, project, plans, transcript, jobId) {
  await updateProject(project.project_id, {
    status: 'RENDERING',
    stage: 'RENDERING',
    progress: 85,
    current_step: 'Rendering clips with FFmpeg.',
  });

  let rendered = 0;
  let failed = 0;

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    try {
      await log(project.project_id, jobId, 'RENDERING', `Rendering clip ${index + 1}/${plans.length}.`, 'info', {
        startSec: plan.startSec,
        endSec: plan.endSec,
      });
      await renderClip(sourcePath, project, plan, transcript, index);
      rendered += 1;
    } catch (error) {
      failed += 1;
      await log(project.project_id, jobId, 'RENDERING', `Clip ${index + 1} failed: ${error.message}`, 'error');
    }
  }

  if (rendered === 0) throw new Error('Rendering failed for every planned clip.');

  await updateProject(project.project_id, {
    status: failed > 0 ? 'PARTIAL_COMPLETED' : 'COMPLETED',
    stage: failed > 0 ? 'PARTIAL_COMPLETED' : 'COMPLETED',
    progress: 100,
    current_step: failed > 0 ? 'Partial clips generated.' : 'All clips rendered successfully.',
    completed_at: now(),
  });

  await log(project.project_id, jobId, 'COMPLETED', 'Rendering finished.', failed > 0 ? 'warn' : 'info', {
    rendered,
    failed,
  });

  return { rendered, failed };
}

async function getExistingTranscript(projectId) {
  const result = await db.execute({
    sql: 'SELECT * FROM transcripts WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
    args: [projectId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    language: row.language,
    fullText: row.full_text,
    segments: parseJsonField(row.segments, []),
    words: parseJsonField(row.words, []),
  };
}

async function processProcessVideoJob(job) {
  const projectResult = await db.execute({
    sql: 'SELECT * FROM projects WHERE project_id = ? LIMIT 1',
    args: [job.project_id],
  });
  const project = projectResult.rows[0];
  if (!project) throw new Error(`Project ${job.project_id} was not found.`);
  if (project.source_type !== 'upload') {
    throw new Error('Worker MVP currently supports uploaded local videos only.');
  }
  if (!project.source_file_path) {
    throw new Error('Project has no source file path.');
  }

  const sourcePath = resolveWorkspacePath(project.source_file_path);

  await updateProject(project.project_id, {
    status: 'PROBING',
    stage: 'PROBING',
    progress: 15,
    current_step: 'Reading video metadata with FFprobe.',
    error_message: null,
  });
  await log(project.project_id, job.job_id, 'PROBING', 'Reading source video metadata.');

  const probe = await probeVideo(sourcePath);
  await updateProject(project.project_id, {
    duration_seconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    codec: probe.codec,
    raw_metadata: JSON.stringify(probe.metadata),
  });
  await log(project.project_id, job.job_id, 'PROBING', 'Video metadata extracted.', 'info', {
    durationSeconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    codec: probe.codec,
  });

  await updateProject(project.project_id, {
    status: 'EXTRACTING_AUDIO',
    stage: 'EXTRACTING_AUDIO',
    progress: 25,
    current_step: 'Extracting 16kHz mono WAV audio with FFmpeg.',
  });
  await log(project.project_id, job.job_id, 'EXTRACTING_AUDIO', 'Extracting audio from source video.');

  const audioPath = await extractAudio(sourcePath, project.project_id);

  await updateProject(project.project_id, {
    status: 'TRANSCRIBING',
    stage: 'TRANSCRIBING',
    progress: 40,
    current_step: 'Transcribing audio with faster-whisper.',
  });
  await log(project.project_id, job.job_id, 'EXTRACTING_AUDIO', 'Audio extracted successfully.', 'info', {
    audioPath,
  });

  let transcript = await getExistingTranscript(project.project_id);

  if (transcript?.segments?.length && transcript.fullText) {
    await log(project.project_id, job.job_id, 'TRANSCRIBING', 'Using existing transcript for this project.', 'info', {
      segments: transcript.segments.length,
    });
  } else {
    await log(project.project_id, job.job_id, 'TRANSCRIBING', 'Starting speech-to-text transcription.');
    transcript = await transcribeAudio(audioPath, project);

    if (!transcript.segments?.length || !transcript.fullText) {
      throw new Error('Transcript could not be generated from this audio.');
    }

    await db.execute({
      sql: 'DELETE FROM transcripts WHERE project_id = ?',
      args: [project.project_id],
    });

    await db.execute({
      sql: `INSERT INTO transcripts (project_id, language, full_text, segments, words, engine, raw_response)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        project.project_id,
        transcript.language || project.language || 'auto',
        transcript.fullText,
        JSON.stringify(transcript.segments),
        JSON.stringify(transcript.words || []),
        process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
        JSON.stringify(transcript),
      ],
    });
  }

  await updateProject(project.project_id, {
    status: 'ANALYZING',
    stage: 'ANALYZING',
    progress: 60,
    current_step: 'Transcript generated. Waiting for AI highlight detection.',
  });
  await log(project.project_id, job.job_id, 'TRANSCRIBING', 'Transcript generated successfully.', 'info', {
    segments: transcript.segments.length,
    language: transcript.language,
  });

  const refreshedProject = {
    ...project,
    duration_seconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    codec: probe.codec,
  };
  const plans = await planClips(transcript, refreshedProject, job.job_id);
  const renderResult = await renderClips(sourcePath, refreshedProject, plans, transcript, job.job_id);

  await completeJob(job.job_id, {
    audioPath,
    transcriptSegments: transcript.segments.length,
    transcriptLanguage: transcript.language,
    plannedClips: plans.length,
    renderedClips: renderResult.rendered,
    failedClips: renderResult.failed,
  });
}

async function tick() {
  const job = await getQueuedJob();
  if (!job) return false;
  const claimed = await claimJob(job);
  if (!claimed) return true;

  try {
    await processJob(job);
  } catch (error) {
    await failJob(job, error instanceof Error ? error : new Error(String(error)));
  }

  return true;
}

/**
 * Download a direct video URL to local storage so FFmpeg/ffprobe can read it
 * as a file (decision D3). Streams the response body to disk with a timeout.
 * Returns the workspace-relative path of the saved file.
 */
async function downloadSourceUrl(url, projectId) {
  const uploadRoot = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || './storage/uploads');
  await mkdir(uploadRoot, { recursive: true });

  // Sniff a sensible extension from the URL path, defaulting to .mp4.
  let ext = '.mp4';
  try {
    const pathname = new URL(url).pathname;
    const match = /\.(mp4|mov|m4v|webm|mkv)$/i.exec(pathname);
    if (match) ext = match[0].toLowerCase();
  } catch { /* keep default */ }

  const outputPath = path.join(uploadRoot, `${projectId}${ext}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.DOWNLOAD_TIMEOUT_MS || 180000));

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'AutoClipAI-Worker/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('video/') && !contentType.includes('octet-stream')) {
      throw new Error(`URL did not return a video (content-type: ${contentType || 'unknown'}). Direct video file URLs only.`);
    }

    if (!response.body) throw new Error('Download response has no body.');

    const fileStream = (await import('fs')).createWriteStream(outputPath);
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
    }
    await new Promise((resolve, reject) => {
      fileStream.end(resolve);
      fileStream.on('error', reject);
    });
  } finally {
    clearTimeout(timeout);
  }

  const statResult = await stat(outputPath);
  if (statResult.size === 0) throw new Error('Downloaded file is empty.');

  return {
    relativePath: path.relative(process.cwd(), outputPath),
    size: statResult.size,
  };
}

/**
 * Resolve the local source path for a project, downloading it first when the
 * source is a direct URL (decision D3). Upload projects already have a local
 * source_file_path.
 */
async function resolveProjectSource(project, jobId) {
  if (project.source_type === 'upload' && project.source_file_path) {
    return resolveWorkspacePath(project.source_file_path);
  }

  if (project.source_type === 'direct_url' && project.source_url) {
    await log(project.project_id, jobId, 'DOWNLOAD', `Downloading source video from ${project.source_url}.`);
    const downloaded = await downloadSourceUrl(project.source_url, project.project_id);

    // Persist the downloaded path + size so future re-renders reuse the file.
    await updateProject(project.project_id, {
      source_file_path: downloaded.relativePath,
      file_size: downloaded.size,
      storage_size: downloaded.size,
    });
    await log(project.project_id, jobId, 'DOWNLOAD', 'Source video downloaded.', 'info', {
      bytes: downloaded.size,
      path: downloaded.relativePath,
    });
    return resolveWorkspacePath(downloaded.relativePath);
  }

  throw new Error('Project has no local source file or direct URL to download.');
}

/**
 * IMPORT_ONLY job: "Don't clip" mode (spec C.4, decision D5). Probes the video,
 * extracts + transcribes audio, then creates ONE clip spanning the whole video
 * and imports it into the editor. No AI planning, no multi-clip rendering.
 */
async function processImportOnlyJob(job) {
  const projectResult = await db.execute({
    sql: 'SELECT * FROM projects WHERE project_id = ? LIMIT 1',
    args: [job.project_id],
  });
  const project = projectResult.rows[0];
  if (!project) throw new Error(`Project ${job.project_id} was not found.`);

  if (project.status === 'CANCELED') {
    await completeJob(job.job_id, { canceled: true });
    return;
  }

  const sourcePath = await resolveProjectSource(project, job.job_id);

  // Probe.
  await updateProject(project.project_id, {
    status: 'PROBING',
    stage: 'PROBING',
    progress: 15,
    current_step: 'Reading video metadata with FFprobe.',
    error_message: null,
  });
  const probe = await probeVideo(sourcePath);
  await updateProject(project.project_id, {
    duration_seconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    codec: probe.codec,
    raw_metadata: JSON.stringify(probe.metadata),
  });

  // Extract audio + transcribe (best-effort; transcript is optional for import).
  await updateProject(project.project_id, {
    status: 'EXTRACTING_AUDIO',
    stage: 'EXTRACTING_AUDIO',
    progress: 25,
    current_step: 'Extracting audio for transcript.',
  });
  let transcript = await getExistingTranscript(project.project_id);
  if (!transcript?.segments?.length) {
    try {
      const audioPath = await extractAudio(sourcePath, project.project_id);
      await updateProject(project.project_id, {
        status: 'TRANSCRIBING',
        stage: 'TRANSCRIBING',
        progress: 40,
        current_step: 'Transcribing audio.',
      });
      transcript = await transcribeAudio(audioPath, project);
      await db.execute({ sql: 'DELETE FROM transcripts WHERE project_id = ?', args: [project.project_id] });
      await db.execute({
        sql: `INSERT INTO transcripts (project_id, language, full_text, segments, words, engine, raw_response)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          project.project_id,
          transcript.language || project.language || 'auto',
          transcript.full_text,
          JSON.stringify(transcript.segments),
          JSON.stringify(transcript.words || []),
          process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
          JSON.stringify(transcript),
        ],
      });
    } catch (error) {
      await log(project.project_id, job.job_id, 'TRANSCRIBING', `Transcription skipped: ${error.message}`, 'warn');
    }
  }

  // Create a single full-video clip for the editor.
  const clipId = `clip_${randomUUID()}`;
  const outputRoot = path.resolve(process.cwd(), process.env.LOCAL_OUTPUT_DIR || './storage/outputs');
  const projectOutputDir = path.join(outputRoot, project.project_id);
  await mkdir(projectOutputDir, { recursive: true });
  const thumbnailPath = path.join(projectOutputDir, `${clipId}.jpg`);

  // Thumbnail from the first second.
  await runCommand(ffmpegPath, [
    '-y',
    '-ss', '1',
    '-i', sourcePath,
    '-frames:v', '1',
    '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    thumbnailPath,
  ]).catch(() => {});

  const durationSeconds = probe.durationSeconds || 0;
  const fileStat = await stat(sourcePath);

  await db.execute({
    sql: `INSERT INTO clips
          (clip_id, opus_clip_id, project_id, title, hook_text, caption, start_sec, end_sec,
           duration_seconds, duration_ms, score, output_file_path, output_storage_url,
           uri_for_preview, uri_for_export, thumbnail_file_path, thumbnail_storage_url,
           subtitle_file_path, render_pref, status, storage_used, time_ranges)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'COMPLETED', ?, ?)`,
    args: [
      clipId,
      clipId,
      project.project_id,
      project.title || 'Imported video',
      project.title || 'Watch this',
      'Imported for manual editing (Don\'t clip mode).',
      0,
      durationSeconds,
      durationSeconds,
      durationSeconds * 1000,
      80,
      path.relative(process.cwd(), sourcePath),
      `/api/clips/${clipId}/video`,
      `/api/clips/${clipId}/video`,
      `/api/clips/${clipId}/video`,
      path.relative(process.cwd(), thumbnailPath),
      `/api/clips/${clipId}/thumbnail`,
      JSON.stringify({ aspectRatio: project.aspect_ratio || '9:16', cropMode: 'none', importOnly: true }),
      fileStat.size,
      JSON.stringify([[0, durationSeconds]]),
    ],
  });

  await updateProject(project.project_id, {
    status: 'COMPLETED',
    stage: 'COMPLETED',
    progress: 100,
    current_step: 'Video imported to editor (Don\'t clip mode).',
    completed_at: now(),
  });
  await log(project.project_id, job.job_id, 'COMPLETED', 'Import-only complete. 1 clip available in editor.', 'info', { clipId });

  await completeJob(job.job_id, {
    importOnly: true,
    clipId,
    durationSeconds,
  });
}

/**
 * RENDER_CLIP job: re-render a single edited clip from its clip_edits config
 * (decision D6/D7, spec Section F). Reads the existing clip + its editor
 * config, renders a fresh output via FFmpeg (no OpusClip export / no
 * watermark), and updates the clip row in place.
 */
async function processRenderClipJob(job) {
  const payload = parseJsonField(job.payload, {});
  const clipId = payload.clipId;
  if (!clipId) throw new Error('RENDER_CLIP job missing clipId in payload.');

  const clipResult = await db.execute({
    sql: 'SELECT * FROM clips WHERE clip_id = ? LIMIT 1',
    args: [clipId],
  });
  const clip = clipResult.rows[0];
  if (!clip) throw new Error(`Clip ${clipId} not found.`);

  const projectResult = await db.execute({
    sql: 'SELECT * FROM projects WHERE project_id = ? LIMIT 1',
    args: [clip.project_id],
  });
  const project = projectResult.rows[0];
  if (!project) throw new Error(`Project ${clip.project_id} not found.`);

  if (project.status === 'CANCELED') {
    await db.execute({
      sql: `UPDATE clips SET status = 'CANCELED', updated_at = ? WHERE clip_id = ?`,
      args: [now(), clipId],
    });
    await completeJob(job.job_id, { canceled: true });
    return;
  }

  const sourcePath = await resolveProjectSource(project, job.job_id);

  // Editor config (may be null on first export).
  const editResult = await db.execute({
    sql: 'SELECT * FROM clip_edits WHERE clip_id = ? ORDER BY updated_at DESC LIMIT 1',
    args: [clipId],
  });
  const editRow = editResult.rows[0];
  const layoutConfig = editRow ? parseJsonField(editRow.layout_config, {}) : {};
  const hookConfig = editRow ? parseJsonField(editRow.hook_config, null) : null;
  const captionConfig = editRow ? parseJsonField(editRow.caption_config, null) : null;
  const renderConfig = editRow ? parseJsonField(editRow.render_config, null) : null;

  const startSec = Number(clip.start_sec || 0);
  const endSec = Number(clip.end_sec || Math.max(startSec + 1, project.duration_seconds || 60));
  const duration = Math.max(1, endSec - startSec);

  const outputRoot = path.resolve(process.cwd(), process.env.LOCAL_OUTPUT_DIR || './storage/outputs');
  const projectOutputDir = path.join(outputRoot, project.project_id);
  await mkdir(projectOutputDir, { recursive: true });
  const newClipId = payload.regenerate ? `clip_${randomUUID()}` : clipId;
  const outputPath = path.join(projectOutputDir, `${newClipId}.mp4`);
  const thumbnailPath = path.join(projectOutputDir, `${newClipId}.jpg`);

  // Reuse the existing subtitle file if present.
  let subtitleAbsPath = '';
  if (clip.subtitle_file_path) {
    subtitleAbsPath = ffmpegFilterPath(path.resolve(process.cwd(), clip.subtitle_file_path));
  }

  const layoutMode = layoutConfig.mode || (project.aspect_ratio === '1:1' ? 'square' : 'full');
  const reframeMode = resolveReframeMode(layoutConfig, project);

  let filterComplex = '';
  if (subtitleAbsPath && layoutMode === 'split-top-bottom') {
    filterComplex = `[0:v]split=2[top][bottom];[top]crop=iw:ih/2:0:0,scale=1080:960[t];[bottom]crop=iw:ih/2:0:ih/2,scale=1080:960[b];[t][b]vstack=inputs=2[v_split];[v_split]subtitles='${subtitleAbsPath}':force_style='FontSize=24'[v_sub]`;
  } else {
    // Auto subject tracking for re-renders too (spec F).
    const reRenderPlan = { startSec: startSec, endSec: endSec, reframeMode };
    const tracking = reframeMode === 'fit-blur' ? null : await trackSubject(sourcePath, reRenderPlan, project.aspect_ratio || '9:16');
    const reRenderTempDir = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp', project.project_id);
    const reRenderCmdPath = path.join(reRenderTempDir, `${newClipId}_crop_cmds.txt`);
    const dynCrop = buildDynamicCropFilter(tracking, reRenderCmdPath);
    const safeAreas = computeSafeAreas(tracking);

    if (dynCrop) {
      const cropBase = `[0:v]${dynCrop},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v_crop]`;
      if (subtitleAbsPath) {
        filterComplex = cropBase + `;[v_crop]subtitles='${subtitleAbsPath}':force_style='FontSize=${safeAreas.captionFontSize},MarginV=${safeAreas.captionMarginV},Alignment=${safeAreas.captionAlignment}'[v_sub]`;
      } else {
        filterComplex = cropBase.replace('[v_crop]', '[v_sub]');
      }
    } else {
      // Safe fallback: keep the full source visible over a blurred 9:16 fill.
      const cropBase = buildFitBlurFilter('v_crop');
      if (subtitleAbsPath) {
        filterComplex = cropBase + `;[v_crop]subtitles='${subtitleAbsPath}':force_style='FontSize=${safeAreas.captionFontSize},MarginV=${safeAreas.captionMarginV},Alignment=${safeAreas.captionAlignment}'[v_sub]`;
      } else {
        filterComplex = cropBase.replace('[v_crop]', '[v_sub]');
      }
    }
  }

  if (hookConfig && hookConfig.text) {
    const escText = escapeDrawtext(hookConfig.text);
    const hStart = hookConfig.startTime || 0;
    const hEnd = hookConfig.endTime || 4;
    filterComplex += `;[v_sub]drawtext=text='${escText}':fontcolor=${String(hookConfig.textColor || '#FFFFFF').replace('#','')}:fontsize=${hookConfig.fontSize || 72}:x=(w-text_w)/2:y=${safeAreas.hookYExpr}:enable='between(t,${hStart},${hEnd})'[v_out]`;
  } else {
    filterComplex += `;[v_sub]copy[v_out]`;
  }

  const baseArgs = [
    '-y',
    '-ss', String(startSec),
    '-i', sourcePath,
    '-t', String(duration),
    '-filter_complex', filterComplex,
    '-map', '[v_out]',
    '-map', '0:a',
    '-c:v', 'h264_nvenc',
    '-preset', 'p4',
    '-cq', '24',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ];

  try {
    await runCommand(ffmpegPath, baseArgs);
  } catch (error) {
    const cpuArgs = [...baseArgs];
    const codecIndex = cpuArgs.indexOf('h264_nvenc');
    if (codecIndex !== -1) {
      cpuArgs[codecIndex] = 'libx264';
      const presetIndex = cpuArgs.indexOf('p4');
      if (presetIndex !== -1) cpuArgs[presetIndex] = 'veryfast';
    }
    await runCommand(ffmpegPath, cpuArgs);
  }

  // Refresh thumbnail.
  await runCommand(ffmpegPath, [
    '-y',
    '-ss', String(Math.max(0, startSec + 1)),
    '-i', sourcePath,
    '-frames:v', '1',
    '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    thumbnailPath,
  ]);

  const outputRelativePath = path.relative(process.cwd(), outputPath);
  const thumbnailRelativePath = path.relative(process.cwd(), thumbnailPath);
  const fileStat = await stat(outputPath);

  // Update the existing clip row with the fresh render output.
  await db.execute({
    sql: `UPDATE clips SET
            output_file_path = ?,
            output_storage_url = ?,
            uri_for_preview = ?,
            uri_for_export = ?,
            thumbnail_file_path = ?,
            thumbnail_storage_url = ?,
            status = 'COMPLETED',
            storage_used = ?,
            render_pref = ?,
            updated_at = ?
          WHERE clip_id = ?`,
    args: [
      outputRelativePath,
      `/api/clips/${clipId}/video`,
      `/api/clips/${clipId}/video`,
      `/api/clips/${clipId}/video`,
      thumbnailRelativePath,
      `/api/clips/${clipId}/thumbnail`,
      fileStat.size,
      JSON.stringify({
        aspectRatio: project.aspect_ratio || '9:16',
        cropMode: reframeMode,
        layoutMode,
        fallbackMode: 'fit-blur',
        captionStyle: captionConfig,
        hookStyle: hookConfig,
        renderConfig,
        reRendered: true,
      }),
      now(),
      clipId,
    ],
  });

  await log(project.project_id, job.job_id, 'RENDER_CLIP', 'Clip re-rendered successfully.', 'info', { clipId, duration });
  await completeJob(job.job_id, { clipId, outputRelativePath, reRendered: true });
}

/**
 * Job dispatcher: routes a claimed job to the right handler by type. CANCELED
 * projects short-circuit before any heavy work (spec Section H / decision D2).
 */
async function processJob(job) {
  // CANCELED guard: if the owning project was deleted/canceled, skip the job.
  const projectResult = await db.execute({
    sql: 'SELECT status FROM projects WHERE project_id = ? LIMIT 1',
    args: [job.project_id],
  });
  const projectRow = projectResult.rows[0];
  if (projectRow && projectRow.status === 'CANCELED') {
    await completeJob(job.job_id, { canceled: true, reason: 'Project canceled.' });
    await log(job.project_id, job.job_id, 'CANCELED', 'Job skipped because project was canceled.', 'warn');
    return;
  }

  switch (job.type) {
    case 'IMPORT_ONLY':
      return processImportOnlyJob(job);
    case 'RENDER_CLIP':
      return processRenderClipJob(job);
    case 'PROCESS_VIDEO':
    default:
      return processProcessVideoJob(job);
  }
}

/**
 * processProcessVideoJob is the original full AI-clipping pipeline, renamed so
 * the dispatcher can call it explicitly while keeping the existing behaviour
 * intact (decision D2 risk mitigation).
 */
console.log(`AutoClip AI worker started with ${databaseUrl}`);

do {
  const processed = await tick();
  if (once) break;
  if (!processed) await new Promise((resolve) => setTimeout(resolve, 5000));
} while (true);
