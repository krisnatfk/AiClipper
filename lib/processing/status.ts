import type { ProjectStatus } from '@/types';

/**
 * Status → progress percentage (spec Section D progress mapping).
 * The worker writes these exact progress values; the frontend must NOT
 * invent its own stuck progress (spec O.18 — no hardcoded progress).
 */
export const PROJECT_PROGRESS: Record<ProjectStatus, number> = {
  DRAFT: 0,
  SOURCE_RESOLVING: 2,
  SOURCE_READY: 5,
  UPLOADED: 5,
  QUEUED: 10,
  DOWNLOADING_SOURCE: 4,
  PROBING: 15,
  EXTRACTING_AUDIO: 25,
  TRANSCRIBING: 40,
  ANALYZING: 60,
  PLANNING_CLIPS: 70,
  RENDERING: 85,
  UPLOADING_OUTPUT: 95,
  COMPLETED: 100,
  PARTIAL_COMPLETED: 100,
  FAILED: 0,
  CANCELED: 0,
};

export function progressForStatus(status: ProjectStatus): number {
  return PROJECT_PROGRESS[status] ?? 0;
}

/**
 * Human-readable status label shown in the UI (spec Section N — UI state rules).
 * Falls back gracefully for unknown statuses instead of showing a raw code.
 */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft — not started',
  SOURCE_RESOLVING: 'Resolving YouTube source',
  DOWNLOADING_SOURCE: 'Downloading YouTube source',
  SOURCE_READY: 'Source ready',
  UPLOADED: 'Video uploaded',
  QUEUED: 'Waiting in queue',
  PROBING: 'Reading video metadata',
  EXTRACTING_AUDIO: 'Extracting audio',
  TRANSCRIBING: 'Generating transcript',
  ANALYZING: 'AI is finding best moments',
  PLANNING_CLIPS: 'Planning clips',
  RENDERING: 'Rendering clips',
  UPLOADING_OUTPUT: 'Saving rendered clips',
  COMPLETED: 'Completed',
  PARTIAL_COMPLETED: 'Partial clips generated',
  FAILED: 'Failed',
  CANCELED: 'Canceled',
  PENDING: 'Waiting to start',
  COMPLETE: 'Completed',
  STALLED: 'Stalled',
};

export function humanStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Waiting to start';
  return STATUS_LABELS[status] ?? `Processing: ${status}`;
}

/**
 * Rough ETA estimate in seconds for the *current* step. This is an estimate,
 * not a guarantee — used only for display. Returns null when there is no
 * meaningful estimate (terminal or not-yet-started).
 *
 * Heuristics are intentionally simple: each active step has a typical duration
 * band; we assume the step is roughly half-done when polled (worker updates
 * step boundaries, not sub-step progress).
 */
const STEP_ETA_SECONDS: Partial<Record<ProjectStatus, number>> = {
  QUEUED: 30,
  PROBING: 10,
  EXTRACTING_AUDIO: 20,
  TRANSCRIBING: 120,
  ANALYZING: 60,
  PLANNING_CLIPS: 15,
  RENDERING: 180,
  UPLOADING_OUTPUT: 20,
};

export function etaForStatus(status: string | null | undefined): number | null {
  if (!status) return null;
  const seconds = STEP_ETA_SECONDS[status as ProjectStatus];
  return typeof seconds === 'number' ? seconds : null;
}

/**
 * Format an ETA (in seconds) as a short human string, e.g. "2m 0s", "~1m".
 */
export function formatEta(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

/** Terminal statuses that should stop polling. */
export const TERMINAL_STATUSES = new Set<string>([
  'COMPLETED',
  'PARTIAL_COMPLETED',
  'FAILED',
  'CANCELED',
  'COMPLETE',
  'STALLED',
]);

export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.has(status);
}
