import { db } from '@/lib/db';
import { processingJobs, clips } from '@/lib/db/schema';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * Job types supported by the worker (spec Section J / decision D2).
 * - PROCESS_VIDEO: full AI clipping pipeline (probe → transcribe → plan → render).
 * - IMPORT_ONLY: "Don't clip" mode — probe + transcribe + import 1 full-video clip to editor (spec C.4).
 * - RENDER_CLIP: re-render a single edited clip from its clip_edits JSON config (spec F, decision D6).
 */
export type JobType = 'PROCESS_VIDEO' | 'IMPORT_ONLY' | 'RENDER_CLIP' | 'DOWNLOAD_SOURCE';

/**
 * Enqueue a processing job for a project. Centralised so every caller uses the
 * same row shape and the worker can claim any job type in priority/created order.
 */
export async function enqueueJob(
  type: JobType,
  projectId: string,
  payload: Record<string, unknown> = {},
  options: { priority?: number } = {}
) {
  const jobId = `job_${randomUUID()}`;

  const [job] = await db
    .insert(processingJobs)
    .values({
      job_id: jobId,
      project_id: projectId,
      type,
      status: 'QUEUED',
      priority: options.priority ?? 0,
      attempts: 0,
      max_attempts: 3,
      progress: 10,
      payload,
    })
    .returning();

  return job;
}

/** Enqueue the full AI clipping pipeline for a project. */
export async function enqueueProcessVideoJob(
  projectId: string,
  payload: Record<string, unknown> = {}
) {
  return enqueueJob('PROCESS_VIDEO', projectId, payload);
}

/** Enqueue a "Don't clip" import-only job (spec C.4, decision D5). */
export async function enqueueImportJob(
  projectId: string,
  payload: Record<string, unknown> = {}
) {
  return enqueueJob('IMPORT_ONLY', projectId, payload);
}

/**
 * Enqueue a re-render job for a single edited clip. The job's project_id is
 * resolved from the clip so the worker's claim loop still finds it via the
 * project relation (decision D2).
 */
export async function enqueueRenderClipJob(
  clipId: string,
  payload: Record<string, unknown> = {}
) {
  const [clip] = await db
    .select({ project_id: clips.project_id })
    .from(clips)
    .where(eq(clips.clip_id, clipId))
    .limit(1);

  if (!clip) {
    throw new Error(`Cannot enqueue RENDER_CLIP: clip ${clipId} not found.`);
  }

  const job = await enqueueJob('RENDER_CLIP', clip.project_id, {
    clipId,
    ...payload,
  });

  return job;
}

/** Enqueue a job to download a YouTube (or other remote) source locally. */
export async function enqueueDownloadSourceJob(
  projectId: string,
  payload: Record<string, unknown> = {}
) {
  return enqueueJob('DOWNLOAD_SOURCE', projectId, payload);
}
