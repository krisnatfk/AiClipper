import { db } from '@/lib/db';
import { processingLogs } from '@/lib/db/schema';

export async function logProcessingEvent(input: {
  projectId: string;
  jobId?: string;
  level?: 'info' | 'warn' | 'error';
  step: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  await db.insert(processingLogs).values({
    project_id: input.projectId,
    job_id: input.jobId,
    level: input.level || 'info',
    step: input.step,
    message: input.message,
    meta: input.meta,
  });
}

