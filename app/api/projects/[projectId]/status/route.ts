import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, processingJobs, processingLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import {
  humanStatusLabel,
  etaForStatus,
  formatEta,
  isTerminalStatus,
} from '@/lib/processing/status';

/**
 * GET /api/projects/[projectId]/status
 *
 * Lightweight status summary for dashboard/card polling (spec Section D / N).
 * Returns status, progress, current_step, ETA, the active job (if any) and the
 * last few processing logs. The frontend polls this every ~20s (spec N) rather
 * than spamming the full project endpoint.
 */
export async function GET(
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

    const displayStatus = project.status || project.stage;

    // Active job (queued or processing) for this project, if any.
    const [activeJob] = await db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.project_id, params.projectId))
      .orderBy(desc(processingJobs.created_at))
      .limit(1);

    const recentLogs = await db
      .select()
      .from(processingLogs)
      .where(eq(processingLogs.project_id, params.projectId))
      .orderBy(desc(processingLogs.created_at))
      .limit(5);

    const etaSeconds = etaForStatus(displayStatus);

    return NextResponse.json({
      data: {
        projectId: project.project_id,
        title: project.title,
        status: displayStatus,
        progress: project.progress,
        currentStep: project.current_step || humanStatusLabel(displayStatus),
        statusLabel: humanStatusLabel(displayStatus),
        errorMessage: project.error_message,
        isTerminal: isTerminalStatus(displayStatus),
        etaSeconds,
        etaLabel: formatEta(etaSeconds),
        clippingMode: project.clipping_mode,
        model: project.model,
        aspectRatio: project.aspect_ratio,
        updatedAt: project.updated_at,
        completedAt: project.completed_at,
        activeJob: activeJob
          ? {
              jobId: activeJob.job_id,
              type: activeJob.type,
              status: activeJob.status,
              attempts: activeJob.attempts,
              maxAttempts: activeJob.max_attempts,
            }
          : null,
        recentLogs: recentLogs.map((log) => ({
          id: log.id,
          step: log.step,
          level: log.level,
          message: log.message,
          createdAt: log.created_at,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to fetch project status:', error);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch project status',
        },
      },
      { status: 500 }
    );
  }
}
