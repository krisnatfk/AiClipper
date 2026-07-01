import { createClient } from '@libsql/client';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { validateEnvironment } from '../lib/system/environmentValidator.mjs';
import { getFfmpegPath, getFfprobePath, getPythonPath } from '../lib/system/config.mjs';
import { getYtdlpPath, checkYtdlp } from '../lib/system/ytdlp.mjs';
import { buildYtdlpInstallCommand } from '../lib/system/installCommands.mjs';
import { getBuiltinCaptionTemplate, getDefaultCaptionTemplate } from '../lib/captions/builtinCaptionTemplates.mjs';

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

const MAX_VIDEO_DURATION_MINUTES = Number(process.env.MAX_VIDEO_DURATION_MINUTES || 120);
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 2048);
console.log(`MAX_VIDEO_DURATION_MINUTES loaded: ${MAX_VIDEO_DURATION_MINUTES}`);
console.log(`MAX_UPLOAD_SIZE_MB loaded: ${MAX_UPLOAD_SIZE_MB}`);

const databaseUrl = process.env.DATABASE_URL || 'file:local.db';
const db = createClient({ url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
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
      shell: false,
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

function offsetTranscriptTimestamps(transcript, offsetSeconds) {
  const offset = Number(offsetSeconds || 0);
  if (!offset || !transcript) return transcript;
  const shift = (item) => ({
    ...item,
    start: Number((Number(item.start || 0) + offset).toFixed(3)),
    end: Number((Number(item.end || 0) + offset).toFixed(3)),
  });
  return {
    ...transcript,
    segments: (transcript.segments || []).map((segment) => ({
      ...shift(segment),
      words: (segment.words || []).map(shift),
    })),
    words: (transcript.words || []).map(shift),
  };
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
          WHERE status = 'QUEUED' AND type IN ('PROCESS_VIDEO', 'IMPORT_ONLY', 'RENDER_CLIP', 'DOWNLOAD_SOURCE')
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
  const { stdout } = await runCommand(getFfprobePath(), [
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

async function extractAudio(sourcePath, projectOrId) {
  const projectId = typeof projectOrId === 'string' ? projectOrId : projectOrId.project_id;
  const tempRoot = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp');
  const projectTempDir = path.join(tempRoot, projectId);
  await mkdir(projectTempDir, { recursive: true });

  const audioPath = path.join(projectTempDir, 'audio.wav');
  const startSec = typeof projectOrId === 'string' ? null : projectOrId.timeframe_start_sec;
  const endSec = typeof projectOrId === 'string' ? null : projectOrId.timeframe_end_sec;
  const args = ['-y'];
  if (startSec != null && endSec != null && Number(endSec) > Number(startSec)) {
    args.push('-ss', String(Math.max(0, Number(startSec))));
  }
  args.push(
    '-i',
    sourcePath,
  );
  if (startSec != null && endSec != null && Number(endSec) > Number(startSec)) {
    args.push('-t', String(Math.max(1, Number(endSec) - Number(startSec))));
  }
  args.push(
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-af',
    'dynaudnorm=f=150:g=15',
    '-f',
    'wav',
    audioPath,
  );
  await runCommand(getFfmpegPath(), args);

  return path.relative(process.cwd(), audioPath);
}

async function transcribeAudio(audioRelativePath, project, jobId = null) {
  const audioPath = resolveWorkspacePath(audioRelativePath);
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'transcribe_faster_whisper.py');
  const pythonPath = getPythonPath();
  const whisperDevice = process.env.WHISPER_DEVICE || 'cpu';
  const computeType = process.env.WHISPER_COMPUTE_TYPE || (whisperDevice === 'cuda' ? 'int8_float16' : 'int8');
  const chunkSeconds = Number(process.env.TRANSCRIBE_CHUNK_SECONDS || 300);
  const maxRetries = Number(process.env.TRANSCRIBE_MAX_RETRIES || 2);
  const maxThreads = Number(process.env.TRANSCRIBE_MAX_THREADS || 4);

  const tempRoot = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp');
  const outputFile = path.join(tempRoot, `transcript_${project.project_id}_${Date.now()}.json`);
  await mkdir(tempRoot, { recursive: true });

  await log(project.project_id, jobId, 'TRANSCRIBING', 'Starting speech-to-text transcription.', 'info', {
    audioPath,
    chunkSeconds,
    maxRetries,
  });

  const { stdout, stderr } = await runCommand(pythonPath, [
    scriptPath,
    '--audio',
    audioPath,
    '--model',
    process.env.WHISPER_MODEL || 'base',
    '--device',
    whisperDevice,
    '--compute-type',
    computeType,
    '--language',
    project.language || 'auto',
    '--chunk-seconds',
    String(chunkSeconds),
    '--max-retries',
    String(maxRetries),
    '--max-threads',
    String(maxThreads),
    '--output',
    outputFile,
  ]);

  // Surface progress events and warnings from stdout/stderr.
  const stdoutLines = stdout.split(/\r?\n/).filter(Boolean);
  const stderrLines = stderr.split(/\r?\n/).filter(Boolean);

  for (const line of stdoutLines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.event === 'audio_duration') {
        await log(project.project_id, jobId, 'TRANSCRIBING', `Audio duration detected: ${Math.round((parsed.duration_seconds || 0) / 60)} minutes.`, 'info', parsed);
      } else if (parsed.event === 'chunks_created') {
        await log(project.project_id, jobId, 'TRANSCRIBING', `Using chunked transcription, chunk size: ${parsed.chunk_seconds} seconds. Total chunks: ${parsed.total_chunks}.`, 'info', parsed);
      } else if (parsed.event === 'transcribe_chunk_start') {
        await log(project.project_id, jobId, 'TRANSCRIBING', `Transcribing chunk ${parsed.chunk}/${parsed.total_chunks}.`, 'info', parsed);
      } else if (parsed.event === 'transcribe_chunk_done') {
        await log(project.project_id, jobId, 'TRANSCRIBING', `Chunk ${parsed.chunk}/${parsed.total_chunks} completed.`, 'info', parsed);
      } else if (parsed.event === 'merging_chunks') {
        await log(project.project_id, jobId, 'TRANSCRIBING', 'Merging transcript chunks.', 'info', parsed);
      } else if (parsed.event === 'transcription_completed') {
        await log(project.project_id, jobId, 'TRANSCRIBING', 'Transcription completed.', 'info', parsed);
      } else if (parsed.event === 'loading_model') {
        await log(project.project_id, jobId, 'TRANSCRIBING', `Loading Whisper model ${parsed.model} on ${parsed.device} (${parsed.compute_type}).`, 'info', parsed);
      }
    } catch {
      // Not a JSON progress line; ignore.
    }
  }

  for (const line of stderrLines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.warning) {
        await log(project.project_id, jobId, 'TRANSCRIBING', parsed.warning, 'warn', {
          details: parsed.details,
          recommendation: parsed.recommendation,
        });
      } else if (parsed.error) {
        throw new Error(parsed.error);
      }
    } catch {
      // Non-JSON stderr; ignore.
    }
  }

  if (!(await stat(outputFile).then(() => true).catch(() => false))) {
    throw new Error('Transcription completed but output file was not created.');
  }

  const resultJson = await readFile(outputFile, 'utf8');
  await unlink(outputFile).catch(() => {});

  return JSON.parse(resultJson);
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

function projectTimeBounds(project, durationSeconds) {
  const duration = Number(durationSeconds || project.duration_seconds || 0);
  const start = project.timeframe_start_sec == null ? 0 : clampNumber(project.timeframe_start_sec, 0, Math.max(0, duration - 1));
  const end = project.timeframe_end_sec == null ? duration : clampNumber(project.timeframe_end_sec, start + 1, duration || start + 1);
  return { start, end, duration: Math.max(0, end - start) };
}

function validateClipPlans(rawPlans, project, durationSeconds) {
  const minDuration = Number(project.clip_min_seconds || 30);
  const maxDuration = Number(project.clip_max_seconds || 90);
  const bounds = projectTimeBounds(project, durationSeconds);
  const plans = [];

  for (const raw of rawPlans) {
    const startSec = clampNumber(raw.startSec ?? raw.start_sec, bounds.start, Math.max(bounds.start, bounds.end - 1));
    const wantedEnd = raw.endSec ?? raw.end_sec ?? startSec + maxDuration;
    const endSec = clampNumber(wantedEnd, startSec + Math.min(20, minDuration), Math.min(bounds.end, startSec + maxDuration));
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
  const bounds = projectTimeBounds(project, durationSeconds);
  const targetDuration = Math.min(maxDuration, Math.max(minDuration, 60));
  const usableSegments = segments.filter((segment) => Number(segment.end) >= bounds.start && Number(segment.start) <= bounds.end && String(segment.text || '').trim().length > 20);
  const plans = [];
  const stride = Math.max(1, Math.floor(usableSegments.length / Math.max(clipCount, 1)));

  for (let i = 0; i < clipCount; i += 1) {
    const anchor = usableSegments[i * stride] || usableSegments[i] || segments[0];
    if (!anchor) break;

    const startSec = Math.max(bounds.start, Math.floor(Number(anchor.start || bounds.start)));
    const endSec = Math.min(bounds.end, startSec + targetDuration);
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
  const bounds = projectTimeBounds(project, videoDur);
  const genre = project.genre || 'Auto';
  const model = project.model || 'Auto';
  const customPrompt = (project.specific_moments_prompt || '').trim();
  const autoHook = project.auto_hook_enabled !== false;

  // Base system instruction varies by clip model (spec Section C.5).
  let modelInstruction = '';
  switch (model) {
    case 'ClipBasic':
      modelInstruction = 'Prioritize clear talking-head moments, speech clarity, simple standalone explanations, and clean starts/stops.';
      break;
    case 'ClipAnything':
      modelInstruction = 'Analyze the transcript flexibly for storytelling, emotional arcs, value, surprise, humor, controversy, or any moment that can stand alone as a strong short.';
      break;
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
    specificGuidance = `\n\nAdditional user instruction (prioritize moments matching this): ${customPrompt}`;
  }

  const hookInstruction = autoHook
    ? 'Each clip must have a compelling hookText — a short attention-grabbing phrase for the first 3-5 seconds.'
    : 'hookText can be empty or minimal — auto hook is disabled.';

  return `You are an expert short-form video editor specializing in ${genre} content. ${modelInstruction}${specificGuidance}

${hookInstruction} Avoid starting in the middle of a sentence. Prioritize moments with strong hooks, useful information, emotion, conflict, surprise, or clear storytelling.

Rules:
- Return ${clipCount} clips.
- Each clip duration must be between ${minDur} and ${maxDur} seconds.
- Timestamps must be inside the selected processing timeframe: ${Math.round(bounds.start)}-${Math.round(bounds.end)} seconds.
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

function assTimestamp(seconds) {
  const safe = Math.max(0, Number(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function assColor(hex, fallback = '#FFFFFF') {
  const clean = String(hex || fallback).replace('#', '');
  const value = clean.length >= 6 ? clean.slice(0, 6) : fallback.replace('#', '');
  const rr = value.slice(0, 2);
  const gg = value.slice(2, 4);
  const bb = value.slice(4, 6);
  return `&H00${bb}${gg}${rr}`;
}

const DEFAULT_CAPTION_SETTINGS = {
  uppercase: true,
  maxWordsPerCaption: 2,
  position: 'bottom-center',
  fontSize: 64,
  fontWeight: 900,
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 8,
  shadow: true,
  animation: 'pop',
};

function escapeAssText(text) {
  return String(text || '')
    .replace(/[{}]/g, '')
    .replace(/\r?\n/g, '\\N');
}

function normalizeCaptionWord(word) {
  return String(word || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getProjectRenderPref(project) {
  return parseJsonField(project.render_pref, {}) || {};
}

function resolveCaptionTemplateId(project) {
  const renderPref = getProjectRenderPref(project);
  return (
    project.caption_template_id
    || renderPref.captionTemplateId
    || renderPref.caption_template_id
    || project.render_template_id
    || renderPref.renderTemplateId
    || 'big-white'
  );
}

function isCaptionEnabled(project) {
  const renderPref = getProjectRenderPref(project);
  const templateId = resolveCaptionTemplateId(project);
  return templateId !== 'no-caption'
    && renderPref.captionEnabled !== false
    && renderPref.caption_enabled !== false;
}

function isHookEnabled(project) {
  const renderPref = getProjectRenderPref(project);
  return project.auto_hook_enabled !== false
    && project.auto_hook_enabled !== 0
    && renderPref.hookEnabled !== false
    && renderPref.hook_enabled !== false;
}

function normalizeCaptionStyle(style, project) {
  const renderPref = getProjectRenderPref(project);
  const captionSettings = renderPref.captionSettings || renderPref.caption_settings || {};
  const merged = {
    ...DEFAULT_CAPTION_SETTINGS,
    ...(style || {}),
    ...captionSettings,
  };
  const maxWords = Number(
    captionSettings.maxWordsPerCaption
    ?? captionSettings.max_words_per_caption
    ?? renderPref.maxWordsPerCaption
    ?? renderPref.max_words_per_caption
    ?? renderPref.maxWordsPerSegment
    ?? merged.maxWordsPerCaption
    ?? merged.maxWordsPerSegment
    ?? 2
  );
  return {
    ...merged,
    maxWordsPerCaption: Math.max(1, Math.min(2, Number.isFinite(maxWords) ? maxWords : 2)),
    maxWordsPerSegment: Math.max(1, Math.min(2, Number.isFinite(maxWords) ? maxWords : 2)),
    uppercase: captionSettings.uppercase ?? renderPref.uppercase ?? renderPref.captionUppercase ?? merged.uppercase ?? true,
  };
}

async function getCaptionStyle(project) {
  const templateId = resolveCaptionTemplateId(project);
  if (templateId) {
    try {
      const result = await db.execute({
        sql: 'SELECT caption_style FROM render_templates WHERE template_id = ? LIMIT 1',
        args: [templateId],
      });
      const row = result.rows[0];
      const style = parseJsonField(row?.caption_style, null);
      if (style) return normalizeCaptionStyle(style, project);
    } catch {
      // Builtin fallback below.
    }
  }

  return normalizeCaptionStyle(
    getBuiltinCaptionTemplate(templateId)?.captionStyle
      || getBuiltinCaptionTemplate('big-white')?.captionStyle
      || getDefaultCaptionTemplate().captionStyle,
    project
  );
}

function transcriptWordsForPlan(transcript, plan) {
  const safeTranscript = transcript || {};
  const allWords = (safeTranscript.words || [])
    .filter((word) => normalizeCaptionWord(word.word).length > 0)
    .filter((word) => Number(word.end) >= plan.startSec && Number(word.start) <= plan.endSec);
  if (allWords.length > 0) return allWords;

  const segments = (safeTranscript.segments || [])
    .filter((segment) => Number(segment.end) >= plan.startSec && Number(segment.start) <= plan.endSec);
  const words = [];
  for (const segment of segments) {
    const textWords = String(segment.text || '').split(/\s+/).filter(Boolean);
    if (!textWords.length) continue;
    const start = Math.max(plan.startSec, Number(segment.start || plan.startSec));
    const end = Math.min(plan.endSec, Number(segment.end || start + 1));
    const step = Math.max(0.2, (end - start) / textWords.length);
    textWords.forEach((word, index) => {
      words.push({
        word,
        start: Number((start + index * step).toFixed(3)),
        end: Number((start + (index + 1) * step).toFixed(3)),
      });
    });
  }
  return words;
}

function buildCaptionSegments(transcript, plan, style) {
  const configuredMaxWords = Number(process.env.CAPTION_MAX_WORDS_PER_SEGMENT || style.maxWordsPerCaption || style.maxWordsPerSegment || 2);
  const maxWords = Math.max(1, Math.min(2, Number.isFinite(configuredMaxWords) ? configuredMaxWords : 2));
  const uppercase = String(process.env.CAPTION_UPPERCASE || style.uppercase || 'true') !== 'false';
  const words = transcriptWordsForPlan(transcript, plan);
  const segments = [];

  for (let index = 0; index < words.length;) {
    const groupSize = Math.min(maxWords, words.length - index);
    const first = words[index];
    const group = words.slice(index, index + groupSize);
    const start = Math.max(0, Number(group[0].start) - plan.startSec);
    let end = Math.max(start + 0.4, Number(group[group.length - 1].end) - plan.startSec);
    end = Math.min(end, start + 2.0, Math.max(start + 0.4, plan.endSec - plan.startSec));
    const text = group.map((item) => normalizeCaptionWord(item.word)).join(' ');
    if (text) {
      segments.push({
        start,
        end,
        words: group.map((item) => normalizeCaptionWord(item.word)),
        text: uppercase ? text.toUpperCase() : text,
      });
    }
    index += groupSize;
  }

  if (segments.length === 0 && plan.hookText) {
    segments.push({ start: 0, end: Math.min(2, plan.endSec - plan.startSec), words: [], text: wrapSubtitle(plan.hookText).toUpperCase() });
  }

  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i].end > segments[i + 1].start) {
      segments[i].end = Math.max(segments[i].start + 0.25, segments[i + 1].start - 0.02);
    }
  }

  return segments;
}

function assAnimationTags(style) {
  const animation = String(style.animation || style.animationIn || 'pop').toLowerCase();
  switch (animation) {
    case 'none':
      return '';
    case 'scale-in':
      return '{\\fad(60,80)\\fscx85\\fscy85\\t(0,160,\\fscx100\\fscy100)}';
    case 'bounce':
    case 'bounce-light':
      return '{\\fad(70,80)\\t(0,100,\\fscx112\\fscy112)\\t(100,190,\\fscx96\\fscy96)\\t(190,260,\\fscx100\\fscy100)}';
    case 'fade-up':
      return '{\\fad(100,100)\\move(540,1580,540,1540,0,180)}';
    case 'pop':
    default:
      return '{\\fad(80,80)\\t(0,120,\\fscx115\\fscy115)\\t(120,220,\\fscx100\\fscy100)}';
  }
}

function assDialogueText(segment, style) {
  const primary = assColor(style.inactiveWordColor || style.textColor || '#FFFFFF');
  const active = assColor(style.activeWordColor || style.highlightColor || '#22C55E');
  const prefix = assAnimationTags(style);
  if (!style.highlightEnabled || !segment.words?.length) {
    return `${prefix}${escapeAssText(segment.text)}`;
  }
  const displayWords = segment.text.split(/\s+/);
  const text = displayWords
    .map((word, index) => index === 0 ? `{\\c${active}}${escapeAssText(word)}{\\c${primary}}` : escapeAssText(word))
    .join(' ');
  return `${prefix}${text}`;
}

function srtBodyFromSegments(segments) {
  return segments
    .map((segment, index) => `${index + 1}\n${srtTimestamp(segment.start)} --> ${srtTimestamp(segment.end)}\n${segment.text}\n`)
    .join('\n');
}

async function writeSubtitleFile(project, plan, transcript, clipIndex, jobId, fileStem = null) {
  if (!isCaptionEnabled(project)) {
    await log(project.project_id, jobId, 'CAPTIONS', 'Caption disabled by selected template or settings.', 'info', {
      captionTemplateId: resolveCaptionTemplateId(project),
    });
    return null;
  }

  const style = await getCaptionStyle(project);
  if (style?.id === 'no-caption') return null;

  const tempRoot = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp');
  const projectTempDir = path.join(tempRoot, project.project_id);
  await mkdir(projectTempDir, { recursive: true });
  const safeStem = String(fileStem || `clip_${clipIndex + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const subtitlePath = path.join(projectTempDir, `${safeStem}.ass`);
  const srtPath = path.join(projectTempDir, `${safeStem}.srt`);

  await log(project.project_id, jobId, 'CAPTIONS', 'Generating subtitles from transcript.', 'info', {
    captionTemplateId: resolveCaptionTemplateId(project),
  });
  const captionSegments = buildCaptionSegments(transcript, plan, style);
  if (captionSegments.length === 0) {
    await log(project.project_id, jobId, 'CAPTIONS', 'Caption enabled but transcript words are missing.', 'warn', {
      startSec: plan.startSec,
      endSec: plan.endSec,
    });
    return null;
  }

  const fontSize = Number(style.fontSize || 64);
  const marginV = Number(style.marginV || (style.position === 'top' ? 180 : 170));
  const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const outline = Math.max(0, Number(style.strokeWidth || 7));
  const shadow = style.shadow ? 2 : 0;
  const primary = assColor(style.textColor || '#FFFFFF');
  const secondary = assColor(style.highlightColor || '#22C55E');
  const outlineColor = assColor(style.strokeColor || '#000000');
  const hookConfig = normalizeHookConfig(project, null, plan.hookText);
  const hookFontSize = Math.max(44, Math.round(fontSize * 0.82));
  const hookMarginV = 170;
  const hookDialogue = hookConfig
    ? `Dialogue: 1,${assTimestamp(hookConfig.startTime)},${assTimestamp(hookConfig.endTime)},Hook,,0,0,0,,${assAnimationTags({ animation: 'pop' })}${escapeAssText(hookConfig.text)}`
    : '';

  const body = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,${style.fontFamily || 'Arial'},${fontSize},${primary},${secondary},${outlineColor},&H99000000,${Number(style.fontWeight || 900) >= 700 ? -1 : 0},0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},80,80,${marginV},1
Style: Hook,${style.fontFamily || 'Arial'},${hookFontSize},${primary},${secondary},${outlineColor},&H99000000,-1,0,0,0,100,100,0,0,1,${Math.max(5, outline)},${Math.max(2, shadow)},8,80,80,${hookMarginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${hookDialogue}
${captionSegments.map((segment) => `Dialogue: 0,${assTimestamp(segment.start)},${assTimestamp(segment.end)},Default,,0,0,0,,${assDialogueText(segment, style)}`).join('\n')}
`;

  await writeFile(subtitlePath, body, 'utf8');
  await writeFile(srtPath, srtBodyFromSegments(captionSegments), 'utf8');
  await log(project.project_id, jobId, 'CAPTIONS', `Subtitle template applied: ${style.name || resolveCaptionTemplateId(project)}.`, 'info', {
    captionTemplateId: resolveCaptionTemplateId(project),
  });
  await log(project.project_id, jobId, 'CAPTIONS', `Subtitle chunks generated: ${captionSegments.length}.`, 'info', {
    maxWordsPerCaption: style.maxWordsPerCaption,
  });
  await log(project.project_id, jobId, 'CAPTIONS', `ASS subtitle file created: ${path.relative(process.cwd(), subtitlePath)}.`, 'info', {
    subtitlePath: path.relative(process.cwd(), subtitlePath),
    fallbackSrtPath: path.relative(process.cwd(), srtPath),
  });
  return path.relative(process.cwd(), subtitlePath);
}

function escapeFfmpegFilterPath(filePath) {
  const absolute = path.resolve(filePath);
  let escaped = absolute.replace(/\\/g, '/');
  // Escape colons so Windows drive letters and other colons survive in filtergraphs.
  escaped = escaped.replace(/:/g, '\\:');
  // Wrap in single quotes for FFmpeg filtergraph. Escape any single quotes in path.
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

function isDynamicCropEnabled() {
  return String(process.env.ENABLE_DYNAMIC_CROP || 'false').trim().toLowerCase() === 'true';
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
  const pythonPath = getPythonPath();
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
    lines.push(`${kf.t} crop@reframe w ${Math.round(kf.w)},`);
    lines.push(`     crop@reframe h ${Math.round(kf.h)},`);
    lines.push(`     crop@reframe x ${Math.round(kf.x)},`);
    lines.push(`     crop@reframe y ${Math.round(kf.y)};`);
  }

  mkdirSync(path.dirname(cmdFilePath), { recursive: true });
  writeFileSync(cmdFilePath, lines.join('\n'), 'utf8');

  const safePath = escapeFfmpegFilterPath(cmdFilePath);
  const x0 = Math.round(first.x);
  const y0 = Math.round(first.y);
  return `sendcmd=f=${safePath},crop@reframe=${outW}:${outH}:${x0}:${y0}`;
}

function buildStaticCropFilter(tracking) {
  if (!tracking || tracking.mode === 'fit-blur' || !tracking.tracked || !tracking.keyframes || tracking.keyframes.length === 0) {
    return null;
  }
  const outW = tracking.cropW;
  const outH = tracking.cropH;
  const sortedX = tracking.keyframes.map((kf) => Number(kf.x || 0)).sort((a, b) => a - b);
  const sortedY = tracking.keyframes.map((kf) => Number(kf.y || 0)).sort((a, b) => a - b);
  const middle = Math.floor(tracking.keyframes.length / 2);
  const x0 = Math.round(sortedX[middle]);
  const y0 = Math.round(sortedY[middle]);
  return `crop=${outW}:${outH}:${x0}:${y0}`;
}

function buildFitBlurFilter(outputLabel = 'v_crop', outputWidth = 1080, outputHeight = 1920) {
  return [
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight},gblur=sigma=28[bg]`,
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[${outputLabel}]`,
  ].join(';');
}

function getOutputSize(aspectRatio = '9:16') {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1080, height: 1080 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '9:16':
    default:
      return { width: 1080, height: 1920 };
  }
}

function buildSubtitleStage(inputLabel, subtitleFilterPath, safeAreas, outputLabel = 'v_sub') {
  if (!subtitleFilterPath) {
    return `[${inputLabel}]setpts=PTS-STARTPTS[${outputLabel}]`;
  }

  return `[${inputLabel}]setpts=PTS-STARTPTS,subtitles=${subtitleFilterPath}[${outputLabel}]`;
}

function normalizeHookConfig(project, hookConfig, hookText = '') {
  if (!isHookEnabled(project)) return null;
  const text = String(hookConfig?.text || hookText || '')
    .replace(/[^\p{L}\p{N}\s?!]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(' ')
    .slice(0, 48)
    .trim();
  if (!text) return null;

  return {
    text: text.toUpperCase(),
    startTime: Number(hookConfig?.startTime ?? 0),
    endTime: Number(hookConfig?.endTime ?? 4),
    textColor: hookConfig?.textColor || '#FFFFFF',
    strokeColor: hookConfig?.strokeColor || '#000000',
    strokeWidth: Number(hookConfig?.strokeWidth ?? 6),
    fontSize: Number(hookConfig?.fontSize ?? 72),
    fontFamily: hookConfig?.fontFamily || 'Arial',
  };
}

function appendHookStage(filterComplex, hookConfig, safeAreas) {
  return `${filterComplex};[v_sub]copy[v_out]`;
}

function buildRenderAttempts({ layoutMode, subtitleFilterPath, tracking, cmdFilePath, dynamicCropEnabled, hookConfig, aspectRatio }) {
  const attempts = [];
  const defaultSafeAreas = computeSafeAreas(null);
  const safeAreas = computeSafeAreas(tracking);
  const output = getOutputSize(aspectRatio);

  if (layoutMode === 'split-top-bottom') {
    const splitBase = [
      '[0:v]split=2[top][bottom]',
      `[top]crop=iw:ih/2:0:0,scale=${output.width}:${Math.floor(output.height / 2)}[t]`,
      `[bottom]crop=iw:ih/2:0:ih/2,scale=${output.width}:${Math.ceil(output.height / 2)}[b]`,
      '[t][b]vstack=inputs=2[v_split]',
    ].join(';');
    const withSubtitle = `${splitBase};${buildSubtitleStage('v_split', subtitleFilterPath, { ...defaultSafeAreas, captionFontSize: 24 })}`;
    attempts.push({
      mode: 'split-top-bottom',
      filterComplex: appendHookStage(withSubtitle, hookConfig, defaultSafeAreas),
      cropCommandPath: null,
    });
    return attempts;
  }

  if (dynamicCropEnabled) {
    const dynCrop = buildDynamicCropFilter(tracking, cmdFilePath);
    if (dynCrop) {
      const base = `[0:v]${dynCrop},scale=${output.width}:${output.height}:force_original_aspect_ratio=increase,crop=${output.width}:${output.height}[v_crop];${buildSubtitleStage('v_crop', subtitleFilterPath, safeAreas)}`;
      attempts.push({
        mode: 'dynamic-crop',
        filterComplex: appendHookStage(base, hookConfig, safeAreas),
        cropCommandPath: cmdFilePath,
      });
    }
  }

  const staticCrop = buildStaticCropFilter(tracking);
  if (staticCrop) {
    const base = `[0:v]${staticCrop},scale=${output.width}:${output.height}:force_original_aspect_ratio=increase,crop=${output.width}:${output.height}[v_crop];${buildSubtitleStage('v_crop', subtitleFilterPath, safeAreas)}`;
    attempts.push({
      mode: 'static-crop',
      filterComplex: appendHookStage(base, hookConfig, safeAreas),
      cropCommandPath: null,
    });
  }

  const fitBlurBase = `${buildFitBlurFilter('v_crop', output.width, output.height)};${buildSubtitleStage('v_crop', subtitleFilterPath, safeAreas)}`;
  attempts.push({
    mode: 'fit-blur',
    filterComplex: appendHookStage(fitBlurBase, hookConfig, safeAreas),
    cropCommandPath: null,
  });

  return attempts;
}

function buildFfmpegRenderArgs({ sourcePath, startSec, duration, filterComplex, outputPath, encoder }) {
  const videoArgs = encoder === 'cpu'
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24']
    : ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '24'];

  return [
    '-y',
    '-ss', String(startSec),
    '-i', sourcePath,
    '-t', String(duration),
    '-filter_complex', filterComplex,
    '-map', '[v_out]',
    '-map', '0:a?',
    ...videoArgs,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ];
}

function summarizeError(error) {
  return String(error?.message || error || '')
    .replace(/\s+/g, ' ')
    .slice(0, 1200);
}

async function runRenderAttempt({ projectId, jobId, attempt, sourcePath, outputPath, subtitlePath, startSec, duration, dynamicCropEnabled }) {
  const debugMeta = {
    inputPath: sourcePath,
    outputPath,
    srtPath: subtitlePath || null,
    cropCommandPath: attempt.cropCommandPath,
    dynamicCropEnabled,
    fallbackMode: attempt.mode,
    filterComplex: attempt.filterComplex,
  };

  await log(projectId, jobId, 'RENDERING', `FFmpeg render attempt: ${attempt.mode}.`, 'info', debugMeta);

  const gpuArgs = buildFfmpegRenderArgs({
    sourcePath,
    startSec,
    duration,
    filterComplex: attempt.filterComplex,
    outputPath,
    encoder: 'gpu',
  });

  try {
    await runCommand(getFfmpegPath(), gpuArgs);
    return { mode: attempt.mode, encoder: 'h264_nvenc' };
  } catch (gpuError) {
    await log(projectId, jobId, 'RENDERING', `Primary FFmpeg render failed for ${attempt.mode}; retrying with CPU encoder.`, 'warn', {
      ...debugMeta,
      error: summarizeError(gpuError),
    });
  }

  const cpuArgs = buildFfmpegRenderArgs({
    sourcePath,
    startSec,
    duration,
    filterComplex: attempt.filterComplex,
    outputPath,
    encoder: 'cpu',
  });

  await runCommand(getFfmpegPath(), cpuArgs);
  return { mode: attempt.mode, encoder: 'libx264' };
}

async function renderWithFallback({ projectId, jobId, sourcePath, outputPath, subtitlePath, subtitleFilterPath, startSec, duration, layoutMode, tracking, cmdFilePath, hookConfig, dynamicCropEnabled, aspectRatio }) {
  let lastError = null;

  const runAttempts = async (attempts, attemptSubtitlePath, captionsBurned) => {
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const result = await runRenderAttempt({
          projectId,
          jobId,
          attempt,
          sourcePath,
          outputPath,
          subtitlePath: attemptSubtitlePath,
          startSec,
          duration,
          dynamicCropEnabled,
        });
        return { ...result, captionsBurned };
      } catch (error) {
        lastError = error;
        const next = attempts[index + 1];
        if (attempt.mode === 'dynamic-crop' && next) {
          await log(projectId, jobId, 'RENDERING', 'Dynamic crop render failed. Falling back to static crop.', 'warn', {
            error: summarizeError(error),
            nextMode: next.mode,
          });
        } else if (attempt.mode === 'static-crop' && next) {
          await log(projectId, jobId, 'RENDERING', 'Static crop render failed. Falling back to fit with blur background.', 'warn', {
            error: summarizeError(error),
            nextMode: next.mode,
          });
        } else if (next) {
          await log(projectId, jobId, 'RENDERING', `Render attempt ${attempt.mode} failed. Trying ${next.mode}.`, 'warn', {
            error: summarizeError(error),
          });
        }
      }
    }
    return null;
  };

  const attempts = buildRenderAttempts({
    layoutMode,
    subtitleFilterPath,
    tracking,
    cmdFilePath,
    dynamicCropEnabled,
    hookConfig,
    aspectRatio,
  });

  const assResult = await runAttempts(attempts, subtitlePath, Boolean(subtitleFilterPath));
  if (assResult) return assResult;

  if (subtitlePath && path.extname(subtitlePath).toLowerCase() === '.ass') {
    const srtPath = subtitlePath.replace(/\.ass$/i, '.srt');
    try {
      await stat(srtPath);
      await log(projectId, jobId, 'RENDERING', 'Caption render fallback: static.', 'warn', {
        error: summarizeError(lastError),
        fallbackSubtitlePath: path.relative(process.cwd(), srtPath),
      });
      const srtAttempts = buildRenderAttempts({
        layoutMode,
        subtitleFilterPath: escapeFfmpegFilterPath(srtPath),
        tracking,
        cmdFilePath,
        dynamicCropEnabled,
        hookConfig,
        aspectRatio,
      });
      const srtResult = await runAttempts(srtAttempts, srtPath, true);
      if (srtResult) return { ...srtResult, subtitleFallback: 'srt' };
    } catch (error) {
      await log(projectId, jobId, 'RENDERING', 'Subtitle file was not generated.', 'warn', {
        error: summarizeError(error),
      });
    }
  }

  if (subtitleFilterPath) {
    await log(projectId, jobId, 'RENDERING', 'FFmpeg subtitle burn failed. Retrying render without subtitle overlay.', 'error', {
      error: summarizeError(lastError),
    });
    const noSubtitleAttempts = buildRenderAttempts({
      layoutMode,
      subtitleFilterPath: '',
      tracking,
      cmdFilePath,
      dynamicCropEnabled,
      hookConfig,
      aspectRatio,
    });
    const noSubtitleResult = await runAttempts(noSubtitleAttempts, '', false);
    if (noSubtitleResult) return { ...noSubtitleResult, subtitleFallback: 'none' };
  }

  throw new Error(`FFmpeg render failed in all modes. Last error: ${summarizeError(lastError)}`);
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

async function renderClip(sourcePath, project, plan, transcript, index, jobId) {
  const outputRoot = path.resolve(process.cwd(), process.env.LOCAL_OUTPUT_DIR || './storage/outputs');
  const projectOutputDir = path.join(outputRoot, project.project_id);
  await mkdir(projectOutputDir, { recursive: true });

  const clipId = `clip_${randomUUID()}`;
  const outputPath = path.join(projectOutputDir, `${clipId}.mp4`);
  const thumbnailPath = path.join(projectOutputDir, `${clipId}.jpg`);
  const subtitleRelativePath = await writeSubtitleFile(project, plan, transcript, index, jobId);
  const subtitlePath = subtitleRelativePath ? path.resolve(process.cwd(), subtitleRelativePath) : '';
  const subtitleFilterPath = subtitlePath ? escapeFfmpegFilterPath(subtitlePath) : '';
  const duration = Math.max(1, plan.endSec - plan.startSec);
  if (subtitlePath) {
    await log(project.project_id, jobId, 'RENDERING', 'Burning subtitles into clip render.', 'info', {
      subtitlePath: subtitleRelativePath,
    });
    await log(project.project_id, jobId, 'RENDERING', `Caption animation applied: ${(await getCaptionStyle(project)).animation || 'pop'}.`, 'info');
  }
  
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
  hookConfig = normalizeHookConfig(project, hookConfig, plan.hookText);
  if (hookConfig) {
    await log(project.project_id, jobId, 'RENDERING', 'Burning hook text into clip render.', 'info', {
      text: hookConfig.text,
      startTime: hookConfig.startTime,
      endTime: hookConfig.endTime,
    });
  }
  const reframeMode = resolveReframeMode(layoutConfig, project);
  const dynamicCropEnabled = isDynamicCropEnabled();
  const tracking = (layoutMode === 'split-top-bottom' || reframeMode === 'fit-blur')
    ? null
    : await trackSubject(sourcePath, { ...plan, reframeMode }, project.aspect_ratio || '9:16');
  const projectTempDir = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp', project.project_id);
  const cmdFilePath = path.join(projectTempDir, `${clipId}_crop_cmds.txt`);

  if (tracking?.keyframes?.length) {
    await log(project.project_id, jobId, 'RENDERING', `Subject tracking applied: ${tracking.keyframes.length} keyframes.`, 'info', {
      dynamicCropEnabled,
      reframeMode,
    });
  }

  if (!dynamicCropEnabled) {
    await log(project.project_id, jobId, 'RENDERING', 'Dynamic crop disabled; using static crop or fit with blur fallback.', 'info', {
      enableDynamicCrop: false,
    });
  }

  const renderResult = await renderWithFallback({
    projectId: project.project_id,
    jobId,
    sourcePath,
    outputPath,
    subtitlePath,
    subtitleFilterPath,
    startSec: plan.startSec,
    duration,
    layoutMode,
    tracking,
    cmdFilePath,
    hookConfig,
    dynamicCropEnabled,
    aspectRatio: project.aspect_ratio || '9:16',
  });

  await runCommand(getFfmpegPath(), [
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
        fallbackMode: renderResult.mode,
        encoder: renderResult.encoder,
        dynamicCropEnabled,
        captionsBurned: Boolean(subtitlePath) && renderResult.captionsBurned !== false,
        hookBurned: Boolean(hookConfig),
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
      await renderClip(sourcePath, project, plan, transcript, index, jobId);
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
  let project = projectResult.rows[0];
  if (!project) throw new Error(`Project ${job.project_id} was not found.`);
  if (!project.source_file_path && !project.source_url) {
    throw new Error('Project has no source file path or source URL.');
  }

  // Resolve/download the source locally before probing. This handles upload,
  // direct_url, and youtube sources uniformly.
  const sourcePath = await resolveProjectSource(project, job.job_id);

  // Refresh project after resolveProjectSource may have downloaded the file.
  const refreshedResult = await db.execute({
    sql: 'SELECT * FROM projects WHERE project_id = ? LIMIT 1',
    args: [job.project_id],
  });
  project = refreshedResult.rows[0];

  await updateProject(project.project_id, {
    status: 'PROBING',
    stage: 'PROBING',
    progress: 15,
    current_step: 'Probing downloaded source video.',
    error_message: null,
  });
  await log(project.project_id, job.job_id, 'PROBING', 'Probing downloaded source video.');

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

  const audioPath = await extractAudio(sourcePath, project);

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
    transcript = await transcribeAudio(audioPath, project, job.job_id);
    transcript = offsetTranscriptTimestamps(transcript, project.timeframe_start_sec);

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

function isYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com';
  } catch {
    return false;
  }
}

async function downloadYouTubeSource(sourceUrl, projectId, jobId) {
  if (!isYouTubeUrl(sourceUrl)) {
    throw new Error(`Invalid YouTube URL: ${sourceUrl}`);
  }

  await updateProject(projectId, {
    status: 'SOURCE_RESOLVING',
    stage: 'SOURCE_RESOLVING',
    progress: 2,
    current_step: 'Resolving YouTube source.',
  });
  await log(projectId, jobId, 'SOURCE_RESOLVING', 'Resolving YouTube source.', 'info', { sourceUrl });

  const ytdlpPath = getYtdlpPath();
  const ytdlpCheck = checkYtdlp();
  if (!ytdlpCheck.ok) {
    throw new Error('yt-dlp belum tersedia. Install dengan winget install -e --id yt-dlp.yt-dlp dan set YTDLP_PATH di .env.');
  }

  await updateProject(projectId, {
    status: 'DOWNLOADING_SOURCE',
    stage: 'DOWNLOADING_SOURCE',
    progress: 4,
    current_step: 'Downloading YouTube video with yt-dlp.',
  });
  await log(projectId, jobId, 'DOWNLOADING_SOURCE', 'Downloading YouTube video with yt-dlp.', 'info', { sourceUrl });

  const uploadRoot = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || './storage/uploads');
  await mkdir(uploadRoot, { recursive: true });
  const outputTemplate = path.join(uploadRoot, `${projectId}.%(ext)s`);

  try {
    await runCommand(ytdlpPath, [
      '-f',
      'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--output',
      outputTemplate,
      '--no-playlist',
      '--newline',
      '--no-warnings',
      sourceUrl,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`yt-dlp failed to download the video: ${message}`);
  }

  const files = await readdir(uploadRoot);
  const candidates = files
    .filter((f) => f.startsWith(projectId))
    .map((f) => path.join(uploadRoot, f));

  if (candidates.length === 0) {
    throw new Error('yt-dlp finished but no output file was found.');
  }

  const downloadedPath = candidates.find((p) => p.endsWith('.mp4')) || candidates[0];
  const relativePath = path.relative(process.cwd(), downloadedPath);
  const fileStat = await stat(downloadedPath);

  const maxDurationSeconds = MAX_VIDEO_DURATION_MINUTES * 60;
  const probe = await probeVideo(downloadedPath);
  if (probe.durationSeconds > maxDurationSeconds) {
    throw new Error(
      `Video duration is ${Math.round(probe.durationSeconds / 60)} minutes, ` +
      `exceeding the limit of ${MAX_VIDEO_DURATION_MINUTES} minutes.`
    );
  }

  await updateProject(projectId, {
    source_file_path: relativePath,
    source_storage_url: relativePath,
    video_url: relativePath,
    file_size: fileStat.size,
    storage_size: fileStat.size,
    duration_seconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    codec: probe.codec,
    raw_metadata: JSON.stringify(probe.metadata),
    status: 'SOURCE_READY',
    stage: 'SOURCE_READY',
    progress: 5,
    current_step: 'YouTube video downloaded successfully.',
    error_message: null,
  });
  await log(projectId, jobId, 'SOURCE_READY', 'YouTube video downloaded successfully.', 'info', {
    path: relativePath,
    bytes: fileStat.size,
    durationSeconds: probe.durationSeconds,
  });

  return { relativePath, size: fileStat.size, probe };
}

/**
 * Resolve the local source path for a project, downloading it first when the
 * source is a remote URL (direct video URL or YouTube). Upload projects already
 * have a local source_file_path.
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

  if (project.source_type === 'youtube') {
    if (project.source_file_path) {
      return resolveWorkspacePath(project.source_file_path);
    }
    if (project.source_url) {
      const downloaded = await downloadYouTubeSource(project.source_url, project.project_id, jobId);
      return resolveWorkspacePath(downloaded.relativePath);
    }
  }

  throw new Error('Project has no local source file or source URL to download.');
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
      const audioPath = await extractAudio(sourcePath, project);
      await updateProject(project.project_id, {
        status: 'TRANSCRIBING',
        stage: 'TRANSCRIBING',
        progress: 40,
        current_step: 'Transcribing audio.',
      });
      transcript = await transcribeAudio(audioPath, project, job.job_id);
      transcript = offsetTranscriptTimestamps(transcript, project.timeframe_start_sec);
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
  await runCommand(getFfmpegPath(), [
    '-y',
    '-ss', String(Math.max(0, Number(project.timeframe_start_sec || 0) + 1)),
    '-i', sourcePath,
    '-frames:v', '1',
    '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    thumbnailPath,
  ]).catch(() => {});

  const fullDurationSeconds = probe.durationSeconds || 0;
  const importBounds = projectTimeBounds(project, fullDurationSeconds);
  const durationSeconds = Math.max(1, Math.round(importBounds.end - importBounds.start));
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
      Math.round(importBounds.start),
      Math.round(importBounds.end),
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
      JSON.stringify([[Math.round(importBounds.start), Math.round(importBounds.end)]]),
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
  const hookConfig = normalizeHookConfig(project, editRow ? parseJsonField(editRow.hook_config, null) : null, clip.hook_text);
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

  // Reuse the existing subtitle file if present. Older clips may not have one,
  // so regenerate from the project transcript before the edited render.
  let subtitlePath = '';
  let subtitleFilterPath = '';
  let subtitleRelativePath = clip.subtitle_file_path || null;
  if (isCaptionEnabled(project)) {
    const transcript = await getExistingTranscript(project.project_id);
    if (transcript?.segments?.length || transcript?.words?.length) {
      subtitleRelativePath = await writeSubtitleFile(project, {
        startSec,
        endSec,
        hookText: clip.hook_text,
      }, transcript, 0, job.job_id, `${clipId}_subtitle`);
      if (subtitleRelativePath) {
        subtitlePath = path.resolve(process.cwd(), subtitleRelativePath);
        subtitleFilterPath = escapeFfmpegFilterPath(subtitlePath);
      }
    }
  }

  if (!subtitlePath && clip.subtitle_file_path) {
    subtitlePath = path.resolve(process.cwd(), clip.subtitle_file_path);
    subtitleFilterPath = escapeFfmpegFilterPath(subtitlePath);
  }

  if (subtitlePath) {
    await log(project.project_id, job.job_id, 'RENDER_CLIP', 'Burning subtitles into clip render.', 'info', {
      subtitlePath: subtitleRelativePath,
    });
  }
  if (hookConfig) {
    await log(project.project_id, job.job_id, 'RENDER_CLIP', 'Burning hook text into clip render.', 'info', {
      text: hookConfig.text,
      startTime: hookConfig.startTime,
      endTime: hookConfig.endTime,
    });
  }

  const layoutMode = layoutConfig.mode || (project.aspect_ratio === '1:1' ? 'square' : 'full');
  const reframeMode = resolveReframeMode(layoutConfig, project);
  const dynamicCropEnabled = isDynamicCropEnabled();
  const reRenderPlan = { startSec: startSec, endSec: endSec, reframeMode };
  const tracking = (layoutMode === 'split-top-bottom' || reframeMode === 'fit-blur')
    ? null
    : await trackSubject(sourcePath, reRenderPlan, project.aspect_ratio || '9:16');
  const reRenderTempDir = path.resolve(process.cwd(), process.env.LOCAL_TEMP_DIR || './storage/tmp', project.project_id);
  const reRenderCmdPath = path.join(reRenderTempDir, `${newClipId}_crop_cmds.txt`);

  if (tracking?.keyframes?.length) {
    await log(project.project_id, job.job_id, 'RENDER_CLIP', `Subject tracking applied: ${tracking.keyframes.length} keyframes.`, 'info', {
      dynamicCropEnabled,
      reframeMode,
    });
  }

  if (!dynamicCropEnabled) {
    await log(project.project_id, job.job_id, 'RENDER_CLIP', 'Dynamic crop disabled; using static crop or fit with blur fallback.', 'info', {
      enableDynamicCrop: false,
    });
  }

  const renderResult = await renderWithFallback({
    projectId: project.project_id,
    jobId: job.job_id,
    sourcePath,
    outputPath,
    subtitlePath,
    subtitleFilterPath,
    startSec,
    duration,
    layoutMode,
    tracking,
    cmdFilePath: reRenderCmdPath,
    hookConfig,
    dynamicCropEnabled,
    aspectRatio: project.aspect_ratio || '9:16',
  });

  // Refresh thumbnail.
  await runCommand(getFfmpegPath(), [
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
            subtitle_file_path = ?,
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
      subtitleRelativePath,
      fileStat.size,
      JSON.stringify({
        aspectRatio: project.aspect_ratio || '9:16',
        cropMode: reframeMode,
        layoutMode,
        fallbackMode: renderResult.mode,
        encoder: renderResult.encoder,
        dynamicCropEnabled,
        captionsBurned: Boolean(subtitlePath) && renderResult.captionsBurned !== false,
        hookBurned: Boolean(hookConfig),
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
 * Mark a job and its owning project FAILED immediately, without retries.
 * Used for environment-check failures that will not improve on retry.
 */
async function processDownloadSourceJob(job) {
  const projectResult = await db.execute({
    sql: 'SELECT * FROM projects WHERE project_id = ? LIMIT 1',
    args: [job.project_id],
  });
  const project = projectResult.rows[0];
  if (!project) throw new Error(`Project ${job.project_id} was not found.`);
  if (project.source_type !== 'youtube') {
    throw new Error(`DOWNLOAD_SOURCE job only supports youtube source_type, got ${project.source_type}.`);
  }
  if (!project.source_url) {
    throw new Error('YouTube project has no source_url.');
  }

  await updateProject(project.project_id, {
    status: 'DOWNLOADING_SOURCE',
    stage: 'DOWNLOADING_SOURCE',
    progress: 4,
    current_step: 'Downloading source video with yt-dlp.',
    error_message: null,
  });
  await log(project.project_id, job.job_id, 'DOWNLOAD_SOURCE', 'Starting yt-dlp download.', 'info', {
    sourceUrl: project.source_url,
  });

  const ytdlpPath = getYtdlpPath();
  const ytdlpCheck = checkYtdlp();
  if (!ytdlpCheck.ok) {
    throw new Error(
      `yt-dlp is not available at ${ytdlpPath}: ${ytdlpCheck.error || 'unknown error'}. ` +
      `Install yt-dlp: ${buildYtdlpInstallCommand()}`
    );
  }

  const uploadRoot = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || './storage/uploads');
  await mkdir(uploadRoot, { recursive: true });
  const outputTemplate = path.join(uploadRoot, `${project.project_id}.%(ext)s`);

  try {
    await runCommand(ytdlpPath, [
      '-f',
      'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '--output',
      outputTemplate,
      '--no-playlist',
      '--newline',
      '--no-warnings',
      project.source_url,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`yt-dlp failed to download the video: ${message}`);
  }

  const files = await readdir(uploadRoot);
  const candidates = files
    .filter((f) => f.startsWith(project.project_id))
    .map((f) => path.join(uploadRoot, f));

  if (candidates.length === 0) {
    throw new Error('yt-dlp finished but no output file was found.');
  }

  const downloadedPath = candidates.find((p) => p.endsWith('.mp4')) || candidates[0];
  const relativePath = path.relative(process.cwd(), downloadedPath);

  await updateProject(project.project_id, {
    status: 'PROBING',
    stage: 'PROBING',
    progress: 15,
    current_step: 'Reading downloaded video metadata with FFprobe.',
  });
  await log(project.project_id, job.job_id, 'PROBING', 'Probing downloaded source.', 'info', {
    path: relativePath,
  });

  const probe = await probeVideo(downloadedPath);
  const maxDurationSeconds = MAX_VIDEO_DURATION_MINUTES * 60;
  if (probe.durationSeconds > maxDurationSeconds) {
    throw new Error(
      `Video duration is ${Math.round(probe.durationSeconds / 60)} minutes, ` +
      `exceeding the limit of ${MAX_VIDEO_DURATION_MINUTES} minutes.`
    );
  }

  const fileStat = await stat(downloadedPath);

  await updateProject(project.project_id, {
    source_file_path: relativePath,
    video_url: relativePath,
    file_size: fileStat.size,
    storage_size: fileStat.size,
    duration_seconds: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    codec: probe.codec,
    raw_metadata: JSON.stringify(probe.metadata),
    status: 'UPLOADED',
    stage: 'UPLOADED',
    progress: 5,
    current_step: 'YouTube source downloaded. Configure the project to start processing.',
    error_message: null,
  });

  await log(project.project_id, job.job_id, 'DOWNLOAD_SOURCE', 'YouTube source downloaded successfully.', 'info', {
    path: relativePath,
    bytes: fileStat.size,
    durationSeconds: probe.durationSeconds,
  });

  await completeJob(job.job_id, {
    sourceFilePath: relativePath,
    durationSeconds: probe.durationSeconds,
  });
}

async function failJobImmediately(job, error) {
  await db.execute({
    sql: `UPDATE processing_jobs
          SET status = 'FAILED', error_message = ?, updated_at = ?
          WHERE job_id = ?`,
    args: [error.message, now(), job.job_id],
  });

  await updateProject(job.project_id, {
    status: 'FAILED',
    stage: 'FAILED',
    progress: 0,
    current_step: 'ENVIRONMENT_CHECK',
    error_message: error.message,
  });

  await log(job.project_id, job.job_id, 'ENVIRONMENT_CHECK', error.message, 'error');
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

  // Environment validation: fail early before any heavy work.
  try {
    const envCheck = await validateEnvironment();
    if (!envCheck.ok) {
      const friendly = envCheck.errors.join('\n');
      const command = envCheck.installCommand
        ? `\n\nInstall command:\n${envCheck.installCommand}\n\nOr open Settings → System Health.`
        : '';
      const message = `Python environment belum lengkap atau path tidak valid.\n${friendly}${command}`;
      await failJobImmediately(job, new Error(message));
      return;
    }

    for (const warning of envCheck.warnings) {
      await log(job.project_id, job.job_id, 'ENVIRONMENT_CHECK', warning, 'warn');
    }
  } catch (validationError) {
    const message = validationError instanceof Error
      ? validationError.message
      : 'Environment validation failed unexpectedly.';
    await failJobImmediately(job, new Error(`Environment check error: ${message}`));
    return;
  }

  switch (job.type) {
    case 'DOWNLOAD_SOURCE':
      return processDownloadSourceJob(job);
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
