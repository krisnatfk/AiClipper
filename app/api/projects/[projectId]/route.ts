import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  projects,
  clips,
  clipPlans,
  transcripts,
  clipEdits,
  overlayLayers,
  trackingKeyframes,
  subtitleSegments,
  processingJobs,
  processingLogs,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rm } from 'fs/promises';
import path from 'path';
import {
  progressForStatus,
  isTerminalStatus,
} from '@/lib/processing/status';
import { probeVideoMetadata } from '@/lib/video/probeVideoMetadata';

const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'PARTIAL_COMPLETED',
  'FAILED',
  'CANCELED',
  'COMPLETE',
  'STALLED',
]);

function toAspectRatio(value: unknown): '9:16' | '1:1' | '16:9' | '4:5' {
  if (value === '1:1' || value === '16:9' || value === '4:5') return value;
  return '9:16';
}

function toProcessingMode(value: unknown): 'fast' | 'balanced' | 'quality' {
  if (value === 'fast' || value === 'quality') return value;
  return 'balanced';
}

function toClippingMode(value: unknown): 'ai_clipping' | 'dont_clip' {
  return value === 'dont_clip' ? 'dont_clip' : 'ai_clipping';
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * GET /api/projects/[projectId]
 * Single project detail. Includes terminal-state metadata for the frontend
 * polling loop so it knows when to stop refreshing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;

    if (!projectId) {
      return NextResponse.json(
        {
          error: { code: 'VALIDATION_ERROR', message: 'Project ID is required' },
        },
        { status: 400 }
      );
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    let responseProject = project;
    if (!project.duration_seconds && project.source_file_path) {
      const probe = await probeVideoMetadata(project.source_file_path);
      if (probe?.durationSeconds) {
        await db
          .update(projects)
          .set({
            duration_seconds: probe.durationSeconds,
            width: probe.width,
            height: probe.height,
            fps: probe.fps,
            codec: probe.codec,
            raw_metadata: probe.rawMetadata,
            timeframe_start_sec: project.timeframe_start_sec ?? 0,
            timeframe_end_sec: project.timeframe_end_sec ?? probe.durationSeconds,
            updated_at: new Date().toISOString(),
          })
          .where(eq(projects.project_id, projectId));
        responseProject = {
          ...project,
          duration_seconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          codec: probe.codec,
          raw_metadata: probe.rawMetadata,
          timeframe_start_sec: project.timeframe_start_sec ?? 0,
          timeframe_end_sec: project.timeframe_end_sec ?? probe.durationSeconds,
        };
      }
    }

    const displayStatus = responseProject.status || responseProject.stage;

    return NextResponse.json({
      data: responseProject,
      meta: {
        isTerminal: TERMINAL_STATUSES.has(displayStatus),
        status: displayStatus,
        refreshed: false,
      },
    });
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_PROJECT_ERROR',
          message: 'Failed to fetch project',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[projectId]
 *
 * Save project configuration (decision D1 step 2 / spec Section C). Persists
 * every configure-page field. Does NOT start processing — that is a separate
 * POST to /api/projects/:id/start. Keeps the project in DRAFT/UPLOADED so the
 * user can still tweak settings.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const body = await request.json();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, params.projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    const aspectRatio = toAspectRatio(body.aspectRatio ?? body.layoutAspectRatio);
    const processingMode = toProcessingMode(body.processingMode);
    const clippingMode = toClippingMode(body.clippingMode);
    const language = String(body.language ?? body.sourceLang ?? project.language ?? 'auto');
    const genre = String(body.genre ?? body.promptPreset ?? 'Auto');
    const clipCount = clampInt(body.clipCount ?? body.clip_count_requested, 1, 20, project.clip_count_requested);
    const clipMin = clampInt(body.clipMinSeconds ?? body.clipDurationMin, 5, 600, project.clip_min_seconds);
    const clipMax = clampInt(body.clipMaxSeconds ?? body.clipDurationMax, clipMin, 1800, Math.max(clipMin, project.clip_max_seconds));
    const duration = Number(project.duration_seconds || 0);
    const minRange = duration > 0 ? Math.min(30, duration) : 30;
    let tfStart = body.timeframeStartSec == null ? null : clampInt(body.timeframeStartSec, 0, duration > 0 ? Math.max(0, duration - minRange) : 100000, 0);
    let tfEnd = body.timeframeEndSec == null ? null : clampInt(body.timeframeEndSec, 1, duration > 0 ? duration : 100000, duration || 60);
    if (tfStart != null && tfEnd != null && tfEnd - tfStart < minRange) {
      if (duration > 0) {
        tfEnd = Math.min(duration, tfStart + minRange);
        tfStart = Math.max(0, Math.min(tfStart, tfEnd - minRange));
      } else {
        tfEnd = tfStart + minRange;
      }
    }
    const autoHook = body.autoHookEnabled ?? body.auto_hook_enabled ?? true;
    const specificPrompt = body.specificMomentsPrompt ?? body.customPrompt ?? '';
    const requestedCaptionTemplateId = body.captionTemplateId ?? body.caption_template_id ?? 'big-white';
    const captionTemplateId = requestedCaptionTemplateId || 'big-white';
    const captionEnabled = captionTemplateId !== 'no-caption' && (body.enableCaption ?? body.caption_enabled ?? true) !== false;
    const captionSettings = {
      uppercase: body.uppercase ?? body.captionUppercase ?? true,
      maxWordsPerCaption: body.max_words_per_caption ?? body.maxWordsPerCaption ?? body.maxWordsPerSegment ?? 2,
      position: 'bottom-center',
      fontSize: 64,
      fontWeight: 900,
      textColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 8,
      shadow: true,
      animation: 'pop',
      ...(body.caption_settings ?? body.captionSettings ?? {}),
    };
    const renderTemplateId = body.renderTemplateId ?? body.render_template_id ?? captionTemplateId;
    const title = body.title ? String(body.title) : project.title;

    // Map a clip "model" preset (spec C.5) to processing_mode + model display.
    const modelPreset = String(body.clipModel ?? body.model ?? '');
    let model = project.model;
    if (modelPreset) {
      model = modelPreset;
    }

    await db
      .update(projects)
      .set({
        title,
        language,
        genre,
        aspect_ratio: aspectRatio,
        processing_mode: processingMode,
        model,
        clipping_mode: clippingMode,
        auto_hook_enabled: autoHook,
        clip_count_requested: clipCount,
        clip_min_seconds: clipMin,
        clip_max_seconds: clipMax,
        timeframe_start_sec: tfStart,
        timeframe_end_sec: tfEnd,
        specific_moments_prompt: specificPrompt || null,
        caption_template_id: captionTemplateId,
        render_template_id: renderTemplateId,
        render_pref: {
          captionEnabled,
          hookEnabled: autoHook,
          aspectRatio,
          captionTemplateId,
          captionTemplate_id: captionTemplateId,
          renderTemplateId,
          captionSettings,
          caption_settings: captionSettings,
          maxWordsPerSegment: captionSettings.maxWordsPerCaption,
          maxWordsPerCaption: captionSettings.maxWordsPerCaption,
          max_words_per_caption: captionSettings.maxWordsPerCaption,
          captionUppercase: captionSettings.uppercase,
          uppercase: captionSettings.uppercase,
          useUploadedSrt: body.useUploadedSrt ?? false,
        },
        curation_pref: {
          promptPreset: genre,
          customPrompt: specificPrompt,
        },
        import_pref: { sourceLang: language },
        updated_at: new Date().toISOString(),
      })
      .where(eq(projects.project_id, params.projectId));

    const [updated] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, params.projectId))
      .limit(1);

    return NextResponse.json({
      data: updated,
      meta: {
        configured: true,
        nextStep: 'start',
        startUrl: `/api/projects/${params.projectId}/start`,
      },
    });
  } catch (error) {
    console.error('Failed to update project settings:', error);
    return NextResponse.json(
      {
        error: {
          code: 'UPDATE_PROJECT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to save project settings',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]?scope=db|clips|all
 *
 * Delete a project and (optionally) its files (spec Section H). Cancels any
 * running job first, then removes clip/transcript/plan/edit/log rows in the
 * right order to satisfy FK-ish relations.
 *
 * scope:
 *  - db:     delete database records only (keep all files)
 *  - clips:  delete records + generated clip output/thumbnail files (keep source)
 *  - all:    delete records + clip outputs + source video
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const scope = (new URL(request.url).searchParams.get('scope') || 'clips') as
      | 'db'
      | 'clips'
      | 'all';

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, params.projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    const projectId = project.project_id;

    // 1. Cancel any running/queued jobs for this project (spec H.2/H.3).
    const activeJobs = await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.project_id, projectId));
    for (const job of activeJobs) {
      if (job.status === 'QUEUED' || job.status === 'PROCESSING') {
        await db
          .update(processingJobs)
          .set({
            status: 'CANCELED',
            error_message: 'Project deleted by user.',
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .where(eq(processingJobs.job_id, job.job_id));
      }
    }

    // 2. Collect clip file paths before deleting rows (for file cleanup).
    const projectClips = await db
      .select()
      .from(clips)
      .where(eq(clips.project_id, projectId));

    // 3. Delete child rows in dependency order.
    // tracking_keyframes depend on overlay_layers — drop those first.
    for (const layer of await db
      .select()
      .from(overlayLayers)
      .where(eq(overlayLayers.clip_id, projectId))) {
      await db
        .delete(trackingKeyframes)
        .where(eq(trackingKeyframes.overlay_layer_id, layer.id));
    }

    // clip_edits / overlay_layers / subtitle_segments are keyed by clip_id (text).
    const clipIds = projectClips
      .map((c) => c.clip_id)
      .filter((id): id is string => Boolean(id));
    for (const clipId of clipIds) {
      await db.delete(clipEdits).where(eq(clipEdits.clip_id, clipId));
      await db.delete(overlayLayers).where(eq(overlayLayers.clip_id, clipId));
      await db.delete(subtitleSegments).where(eq(subtitleSegments.clip_id, clipId));
    }

    await db.delete(clips).where(eq(clips.project_id, projectId));
    await db.delete(clipPlans).where(eq(clipPlans.project_id, projectId));
    await db.delete(transcripts).where(eq(transcripts.project_id, projectId));
    await db.delete(processingLogs).where(eq(processingLogs.project_id, projectId));
    await db.delete(processingJobs).where(eq(processingJobs.project_id, projectId));

    // 4. Optionally delete files.
    if (scope !== 'db') {
      const workspace = process.cwd();
      const safeDelete = async (relPath: string | null | undefined) => {
        if (!relPath) return;
        try {
          const abs = path.resolve(workspace, relPath);
          if (abs.toLowerCase().startsWith(workspace.toLowerCase())) {
            await rm(abs, { force: true, recursive: true });
          }
        } catch {
          /* best-effort */
        }
      };

      for (const clip of projectClips) {
        await safeDelete(clip.output_file_path);
        await safeDelete(clip.thumbnail_file_path);
        await safeDelete(clip.subtitle_file_path);
      }

      if (scope === 'all') {
        await safeDelete(project.source_file_path);
      }
    }

    // 5. Finally delete the project row.
    await db.delete(projects).where(eq(projects.project_id, projectId));

    return NextResponse.json({
      data: { projectId, deleted: true, scope },
      meta: { canceledJobs: activeJobs.length },
    });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json(
      {
        error: {
          code: 'DELETE_PROJECT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete project',
        },
      },
      { status: 500 }
    );
  }
}
