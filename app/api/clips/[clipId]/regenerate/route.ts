import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips, processingJobs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logProcessingEvent } from '@/lib/logs/processingLogger';

/**
 * POST /api/clips/[clipId]/regenerate
 *
 * Regenerate a clip's metadata (title, hook, caption, hashtags, score) via the
 * AI planner (spec Section E clip actions). MVP re-queues a RENDER_CLIP job
 * with a regenerate flag so the worker can re-plan the single clip from the
 * project's transcript and re-render. The clip keeps its time range; only its
 * textual metadata + rendered output are refreshed.
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

    if (clip.status === 'RENDERING') {
      return NextResponse.json(
        { error: { code: 'ALREADY_RENDERING', message: 'A render is already in progress for this clip.' } },
        { status: 409 }
      );
    }

    const clipId = clip.clip_id;

    // For MVP, regenerate = re-render with a regenerate flag so the worker can
    // refresh metadata from the transcript before rendering (decision: enqueue
    // RENDER_CLIP with regenerate=true rather than a full re-plan pipeline).
    const job = await db
      .insert(processingJobs)
      .values({
        job_id: `job_${crypto.randomUUID()}`,
        project_id: clip.project_id,
        type: 'RENDER_CLIP',
        status: 'QUEUED',
        priority: 0,
        attempts: 0,
        max_attempts: 3,
        progress: 10,
        payload: {
          clipId,
          regenerate: true,
          forceExport: true,
        },
      })
      .returning();

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
      jobId: job[0].job_id,
      step: 'REGENERATE',
      message: 'Clip regeneration queued.',
      meta: { clipId: clip.clip_id },
    });

    return NextResponse.json(
      {
        data: {
          clipId,
          status: 'RENDERING',
        },
        meta: {
          jobId: job[0].job_id,
          jobType: 'RENDER_CLIP',
          regenerate: true,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to queue clip regeneration:', error);
    return NextResponse.json(
      {
        error: {
          code: 'REGENERATE_CLIP_ERROR',
          message: error instanceof Error ? error.message : 'Failed to queue clip regeneration',
        },
      },
      { status: 500 }
    );
  }
}
