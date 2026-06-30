import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { enqueueProcessVideoJob } from '@/lib/queue/databaseQueue';
import { logProcessingEvent } from '@/lib/logs/processingLogger';
import { eq } from 'drizzle-orm';

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
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found',
          },
        },
        { status: 404 }
      );
    }

    if (project.source_type !== 'upload' || !project.source_file_path) {
      return NextResponse.json(
        {
          error: {
            code: 'RETRY_UNSUPPORTED',
            message: 'MVP retry currently supports uploaded local videos only.',
          },
        },
        { status: 400 }
      );
    }

    const job = await enqueueProcessVideoJob(project.project_id, {
      sourceFilePath: project.source_file_path,
      clipCount: project.clip_count_requested,
      clipMinSeconds: project.clip_min_seconds,
      clipMaxSeconds: project.clip_max_seconds,
      aspectRatio: project.aspect_ratio,
      processingMode: project.processing_mode,
      retry: true,
    });

    await db
      .update(projects)
      .set({
        status: 'QUEUED',
        stage: 'QUEUED',
        progress: 10,
        current_step: 'Retry queued for local processing.',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(projects.project_id, project.project_id));

    await logProcessingEvent({
      projectId: project.project_id,
      jobId: job.job_id,
      step: 'RETRY',
      message: 'Project retry queued for self-processing.',
    });

    return NextResponse.json({
      data: {
        ...project,
        status: 'QUEUED',
        stage: 'QUEUED',
        progress: 10,
        current_step: 'Retry queued for local processing.',
      },
      meta: {
        jobId: job.job_id,
      },
    });
  } catch (error) {
    console.error('Failed to retry project:', error);

    return NextResponse.json(
      {
        error: {
          code: 'RETRY_PROJECT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to retry project',
        },
      },
      { status: 500 }
    );
  }
}
