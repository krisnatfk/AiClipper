import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, processingJobs } from '@/lib/db/schema';
import {
  enqueueProcessVideoJob,
  enqueueImportJob,
} from '@/lib/queue/databaseQueue';
import { logProcessingEvent } from '@/lib/logs/processingLogger';
import { eq } from 'drizzle-orm';

const STARTED_STATUSES = new Set([
  'QUEUED',
  'PROBING',
  'EXTRACTING_AUDIO',
  'TRANSCRIBING',
  'ANALYZING',
  'PLANNING_CLIPS',
  'RENDERING',
  'UPLOADING_OUTPUT',
]);

/**
 * POST /api/projects/[projectId]/start
 *
 * Step 3 of the draft-first flow (decision D1 / spec C.14). Enqueues the
 * appropriate worker job based on the saved clipping_mode and flips the
 * project to QUEUED. This is the ONLY place a processing job is created for
 * a fresh project — upload/from-url no longer enqueue.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
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

    // Prevent double-start: if already processing, return current state.
    if (STARTED_STATUSES.has(project.status || project.stage)) {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_PROCESSING',
            message: 'This project is already processing.',
          },
        },
        { status: 409 }
      );
    }

    // Terminal-but-completed projects can't be re-started from here; use retry.
    if (project.status === 'COMPLETED') {
      return NextResponse.json(
        {
          error: {
            code: 'ALREADY_COMPLETED',
            message: 'Project already completed. Use retry to reprocess.',
          },
        },
        { status: 409 }
      );
    }

    const mode = project.clipping_mode || 'ai_clipping';
    const duration = Number(project.duration_seconds || 0);
    const startSec = project.timeframe_start_sec == null ? 0 : Number(project.timeframe_start_sec);
    const endSec = project.timeframe_end_sec == null ? duration : Number(project.timeframe_end_sec);
    if (duration > 0 && (startSec < 0 || endSec > duration || startSec >= endSec)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TIMEFRAME',
            message: 'Processing timeframe is invalid. Please choose a valid start and end time.',
          },
        },
        { status: 400 }
      );
    }
    const payload = {
      sourceFilePath: project.source_file_path,
      sourceUrl: project.source_url,
      clipCount: project.clip_count_requested,
      clipMinSeconds: project.clip_min_seconds,
      clipMaxSeconds: project.clip_max_seconds,
      aspectRatio: project.aspect_ratio,
      processingMode: project.processing_mode,
      clippingMode: mode,
      timeframeStartSec: startSec,
      timeframeEndSec: endSec || null,
    };

    const job =
      mode === 'dont_clip'
        ? await enqueueImportJob(project.project_id, payload)
        : await enqueueProcessVideoJob(project.project_id, payload);

    await db
      .update(projects)
      .set({
        status: 'QUEUED',
        stage: 'QUEUED',
        progress: 10,
        current_step: 'Processing job queued. Waiting for worker.',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(projects.project_id, project.project_id));

    await logProcessingEvent({
      projectId: project.project_id,
      jobId: job.job_id,
      step: 'QUEUE',
      message:
        mode === 'dont_clip'
          ? 'Import-only job queued (Don’t clip mode).'
          : 'AI clipping job queued.',
      meta: { clippingMode: mode },
    });

    return NextResponse.json(
      {
        data: {
          ...project,
          status: 'QUEUED',
          stage: 'QUEUED',
          progress: 10,
          current_step: 'Processing job queued. Waiting for worker.',
        },
        meta: {
          jobId: job.job_id,
          jobType: job.type,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to start project:', error);
    return NextResponse.json(
      {
        error: {
          code: 'START_PROJECT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start project',
        },
      },
      { status: 500 }
    );
  }
}
