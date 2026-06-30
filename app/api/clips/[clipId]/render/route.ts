import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips, processingJobs } from '@/lib/db/schema';
import { enqueueRenderClipJob } from '@/lib/queue/databaseQueue';
import { eq } from 'drizzle-orm';
import { logProcessingEvent } from '@/lib/logs/processingLogger';

/**
 * POST /api/clips/[clipId]/render
 *
 * Re-render an edited clip through the worker (spec Section F, decision D6/D7).
 * The editor config is already persisted via PATCH /api/clips/:id/edit; this
 * endpoint enqueues a RENDER_CLIP job. The worker reads the latest clip_edits
 * and renders a fresh output file via FFmpeg (no OpusClip export / no watermark,
 * per spec P.20). The frontend polls the clip status until COMPLETED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const [clip] = await db
      .select()
      .from(clips)
      .where(eq(clips.clip_id, params.clipId))
      .limit(1);

    if (!clip || !clip.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    // Reject if a render is already in flight for this clip.
    if (clip.status === 'RENDERING') {
      return NextResponse.json(
        { error: { code: 'ALREADY_RENDERING', message: 'A render is already in progress for this clip.' } },
        { status: 409 }
      );
    }

    const clipId = clip.clip_id;

    const body = await request.json().catch(() => ({}));

    const job = await enqueueRenderClipJob(clipId, {
      clipId: clip.clip_id,
      forceExport: true,
      renderConfig: body.render_config ?? null,
    });

    await db
      .update(clips)
      .set({
        status: 'RENDERING',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(clips.clip_id, clipId));

    await logProcessingEvent({
      projectId: clip.project_id,
      jobId: job.job_id,
      step: 'RENDER_CLIP',
      message: 'Clip re-render queued from editor.',
      meta: { clipId: clip.clip_id },
    });

    return NextResponse.json(
      {
        data: {
          clipId,
          status: 'RENDERING',
        },
        meta: {
          jobId: job.job_id,
          jobType: job.type,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to queue clip render:', error);
    return NextResponse.json(
      {
        error: {
          code: 'RENDER_CLIP_ERROR',
          message: error instanceof Error ? error.message : 'Failed to queue clip render',
        },
      },
      { status: 500 }
    );
  }
}
