import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { createClipProject } from '@/lib/opus/opusClient';
import type { CreateProjectPayload } from '@/types';
import { eq } from 'drizzle-orm';

/**
 * Safe mode defaults for retry
 * These settings are optimized to succeed on most videos
 */
const SAFE_MODE_DEFAULTS: Partial<CreateProjectPayload> = {
  curationPref: {
    model: 'ClipAnything',
    clipDurations: [[30, 90]],
    genre: 'Auto',
    range: {
      startSec: 0,
      endSec: 300, // First 5 minutes only
    },
    customPrompt:
      'Find the most interesting, emotional, controversial, funny, or informative moments from this video and turn them into short viral clips.',
  },
  importPref: {
    sourceLang: 'id',
  },
  renderPref: {
    layoutAspectRatio: 'portrait',
    enableCaption: true,
    enableHighlight: true,
    enableEmoji: true,
    enableUppercase: true,
    quickstartConfig: {
      enableRemoveFillerWords: false,
    },
  },
};

/**
 * POST /api/projects/[projectId]/retry
 * Create a new project retrying the same video URL with updated settings
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;

    if (!projectId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Project ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Fetch original project
    const [originalProject] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, projectId))
      .limit(1);

    if (!originalProject) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Original project not found',
          },
        },
        { status: 404 }
      );
    }

    // Parse request body for optional overrides
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine, use defaults
    }

    const safeMode = body.safeMode === true;

    // Build payload based on safe mode or custom overrides
    let payload: CreateProjectPayload;

    if (safeMode) {
      // Safe mode: use proven defaults
      payload = {
        videoUrl: (body.videoUrl as string) || originalProject.video_url,
        uploadedVideoAttr: {
          title: `${originalProject.title} (Retry)`,
        },
        ...SAFE_MODE_DEFAULTS,
      };
    } else {
      // Custom retry: merge original settings with overrides
      const model = (body.model as string) || originalProject.model || 'ClipAnything';

      payload = {
        videoUrl: (body.videoUrl as string) || originalProject.video_url,
        uploadedVideoAttr: {
          title: (body.title as string) || `${originalProject.title} (Retry)`,
        },
        curationPref: {
          model: model as 'ClipBasic' | 'ClipAnything',
          clipDurations: body.clipDurations
            ? (body.clipDurations as Array<[number, number]>)
            : [[30, 90]],
          genre: (body.genre as string) || originalProject.genre || 'Auto',
        },
        importPref: {
          sourceLang: (body.sourceLang as string) || 'id',
        },
        renderPref: {
          layoutAspectRatio:
            (body.layoutAspectRatio as 'portrait' | 'square' | 'landscape') || 'portrait',
          enableCaption: body.enableCaption !== false,
          enableHighlight: body.enableHighlight !== false,
          enableEmoji: body.enableEmoji !== false,
          enableUppercase: body.enableUppercase !== false,
          quickstartConfig: {
            enableRemoveFillerWords: body.enableRemoveFillerWords === true,
          },
        },
      };

      // Add range if specified
      if (body.rangeStartSec !== undefined && body.rangeEndSec !== undefined) {
        const startSec = body.rangeStartSec as number;
        const endSec = body.rangeEndSec as number;
        if (endSec > startSec) {
          payload.curationPref!.range = { startSec, endSec };
        }
      }

      // Add custom prompt for ClipAnything
      if (body.customPrompt && model === 'ClipAnything') {
        payload.curationPref!.customPrompt = body.customPrompt as string;
      }

      // Add topic keywords for ClipBasic
      if (body.topicKeywords && model === 'ClipBasic') {
        const keywords = typeof body.topicKeywords === 'string'
          ? (body.topicKeywords as string).split(',').map(k => k.trim()).filter(Boolean)
          : (body.topicKeywords as string[]);
        if (keywords.length > 0) {
          payload.curationPref!.topicKeywords = keywords;
        }
      }

      // Add brand template if specified
      if (body.brandTemplateId) {
        payload.brandTemplateId = body.brandTemplateId as string;
      }
    }

    // Call OpusClip API to create new project
    const opusProject = await createClipProject(payload);

    // Save new project to database (don't overwrite original)
    const [newProject] = await db
      .insert(projects)
      .values({
        project_id: opusProject.id,
        org_id: opusProject.orgId,
        user_id: opusProject.userId,
        title: payload.uploadedVideoAttr?.title || originalProject.title,
        source_platform: opusProject.sourcePlatform,
        source_id: opusProject.sourceId,
        source_uri: opusProject.sourceUri,
        video_url: payload.videoUrl,
        model: payload.curationPref?.model || 'ClipAnything',
        genre: payload.curationPref?.genre || 'Auto',
        stage: opusProject.stage || 'PENDING',
        visibility: opusProject.visibility,
        storage_size: opusProject.storageSize,
        storage_status: opusProject.storageStatus,
        storage_expire_at: opusProject.storageExpireAt,
        curation_pref: payload.curationPref,
        render_pref: payload.renderPref,
        import_pref: payload.importPref,
        raw_response: opusProject,
      })
      .returning();

    return NextResponse.json(
      {
        data: newProject,
        meta: {
          opusProjectId: opusProject.id,
          retryOf: projectId,
          safeMode,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to retry project:', error);

    return NextResponse.json(
      {
        error: {
          code: 'RETRY_PROJECT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to retry project',
          details: error instanceof Error ? error.stack : undefined,
        },
      },
      { status: 500 }
    );
  }
}
