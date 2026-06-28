'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import ClipCard from '@/components/clip/ClipCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ProgressBar from '@/components/ui/ProgressBar';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { ClipCardSkeleton } from '@/components/ui/LoadingSkeleton';
import type { Project, Clip } from '@/types';
import { formatDate, formatBytes } from '@/lib/utils';
import {
  RefreshCw,
  ExternalLink,
  Share2,
  Film,
  Clock,
  ArrowLeft,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Zap,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';

// ─── Constants ───

const POLL_INTERVAL_MS = 20_000; // 20 seconds (was 5)
const TERMINAL_STAGES = new Set(['COMPLETE', 'STALLED', 'FAILED']);

const stageProgress: Record<string, number> = {
  PENDING: 5,
  QUEUED: 15,
  IMPORT: 25,
  CURATE: 50,
  REFINE: 65,
  RENDER: 80,
  UPLOAD: 90,
  COMPLETE: 100,
  STALLED: 0, // Not shown as meaningful progress
  FAILED: 0,
};

const stageLabels: Record<string, string> = {
  PENDING: 'Waiting to start…',
  QUEUED: 'Queued…',
  IMPORT: 'Importing video…',
  CURATE: 'AI is finding best moments…',
  REFINE: 'Refining clips…',
  RENDER: 'Rendering clips…',
  UPLOAD: 'Uploading final clips…',
  COMPLETE: 'Completed',
  STALLED: 'Failed or stalled',
  FAILED: 'Failed',
};

// ─── Error Messages ───

const ERROR_MESSAGES: Record<string, string> = {
  no_clips_rendered: 'OpusClip could not render clips from this video.',
  not_enough_words: 'The video may not contain enough clear speech. Try ClipAnything.',
  processing_too_long: 'Processing took too long. Credits may be refunded by OpusClip.',
  rate_limited: 'Too many API requests. Please wait and try again.',
  invalid_api_key: 'API key is invalid. Check your backend .env.',
  credit_issue: 'Insufficient credits or billing issue.',
};

// ─── Helpers ───

function getProjectProgress(stage: string): number {
  return stageProgress[stage] ?? 10;
}

function getStageLabel(stage: string): string {
  return stageLabels[stage] ?? `Processing: ${stage}`;
}

function getProgressVariant(stage: string): 'default' | 'success' | 'warning' | 'error' {
  if (stage === 'COMPLETE') return 'success';
  if (stage === 'STALLED') return 'warning';
  if (stage === 'FAILED') return 'error';
  return 'default';
}

// ─── Component ───

export default function ProjectDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [polling, setPolling] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = project ? TERMINAL_STAGES.has(project.stage) : false;
  const isStalledNoClips = project?.stage === 'STALLED' && clips.length === 0;
  const isStalledWithClips = project?.stage === 'STALLED' && clips.length > 0;
  const isFailed = project?.stage === 'FAILED';

  // Fetch project and clips
  const fetchProjectData = useCallback(
    async (isBackgroundPoll = false) => {
      try {
        if (isBackgroundPoll) {
          setPolling(true);
        } else {
          setLoading(true);
        }
        setError('');

        const projectRes = await fetch(`/api/projects/${params.projectId}`);
        if (!projectRes.ok) throw new Error('Failed to fetch project');
        const projectData = await projectRes.json();
        setProject(projectData.data);
        setLastUpdatedAt(new Date());

        // Stop polling if terminal
        if (projectData.meta?.isTerminal && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }

        const clipsRes = await fetch(`/api/projects/${params.projectId}/clips`);
        if (clipsRes.ok) {
          const clipsData = await clipsRes.json();
          setClips(clipsData.data || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
        setPolling(false);
      }
    },
    [params.projectId]
  );

  // Initial fetch
  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  // Smart polling — only for non-terminal stages, 20s interval
  useEffect(() => {
    if (!project || TERMINAL_STAGES.has(project.stage)) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      fetchProjectData(true);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [project?.stage, fetchProjectData]);

  // Sync clips
  const handleSyncClips = async () => {
    try {
      setSyncing(true);
      setError('');

      const response = await fetch(`/api/projects/${params.projectId}/sync-clips`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to sync clips');
      }

      await fetchProjectData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSyncing(false);
    }
  };

  // Retry project
  const handleRetry = async (safeMode: boolean) => {
    try {
      setRetrying(true);
      setError('');

      const response = await fetch(`/api/projects/${params.projectId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeMode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to retry project');
      }

      const data = await response.json();
      router.push(`/projects/${data.data.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setRetrying(false);
    }
  };

  // ─── Loading ───
  if (loading) {
    return (
      <AppShell>
        <div className="min-h-full bg-canvas p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-card rounded w-1/3" />
              <div className="h-64 bg-card rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ClipCardSkeleton key={i} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ─── Error / Not Found ───
  if (error && !project) {
    return (
      <AppShell>
        <div className="min-h-full bg-canvas p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-6 text-center">
              <p className="text-alert">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={() => router.push('/projects')}>
                Back to Projects
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!project) return null;

  // ─── Main Render ───
  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Back */}
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>

          {/* Header Card */}
          <div className="card p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-primary mb-2 break-words">
                  {project.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-secondary">
                  <StatusBadge stage={project.stage} />
                  <span>•</span>
                  <span>{project.model}</span>
                  {project.source_platform && (
                    <>
                      <span>•</span>
                      <span>{project.source_platform}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" title="Share project">
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-secondary mb-1">Project ID</div>
                <div className="text-sm text-primary font-mono truncate">{project.project_id}</div>
              </div>
              <div>
                <div className="text-xs text-secondary mb-1">Created</div>
                <div className="text-sm text-primary">{formatDate(project.created_at)}</div>
              </div>
              {project.storage_size ? (
                <div>
                  <div className="text-xs text-secondary mb-1">Storage</div>
                  <div className="text-sm text-primary">{formatBytes(project.storage_size)}</div>
                </div>
              ) : null}
              {project.storage_expire_at ? (
                <div>
                  <div className="text-xs text-secondary mb-1">Expires</div>
                  <div className="text-sm text-energy">{formatDate(project.storage_expire_at)}</div>
                </div>
              ) : null}
            </div>

            {/* Progress */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-primary">Processing Progress</div>
                  <div className="text-xs text-secondary mt-0.5">
                    {isTerminal
                      ? project.stage === 'COMPLETE'
                        ? 'Processing complete'
                        : 'Auto-update stopped — project is no longer processing'
                      : `Auto-updates every ${POLL_INTERVAL_MS / 1000} seconds`}
                  </div>
                </div>
                <div className="text-xs text-secondary">
                  {polling
                    ? 'Updating...'
                    : lastUpdatedAt
                      ? `Updated ${lastUpdatedAt.toLocaleTimeString()}`
                      : 'Waiting...'}
                </div>
              </div>

              {/* Show progress bar only for active/complete */}
              {!isStalledNoClips && !isFailed && (
                <ProgressBar
                  progress={getProjectProgress(project.stage)}
                  stage={getStageLabel(project.stage)}
                  showPercentage
                />
              )}

              {/* STALLED warning bar */}
              {project.stage === 'STALLED' && (
                <div className="bg-energy/10 border border-energy/20 rounded-lg p-1">
                  <div className="h-2 rounded-full bg-energy/40 w-full" />
                </div>
              )}

              {/* FAILED error bar */}
              {isFailed && (
                <div className="bg-alert/10 border border-alert/20 rounded-lg p-1">
                  <div className="h-2 rounded-full bg-alert/40 w-full" />
                </div>
              )}
            </div>

            {/* Source URL */}
            {project.video_url && (
              <div className="pt-4 border-t border-border">
                <div className="text-xs text-secondary mb-2">Source Video</div>
                <a
                  href={project.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:text-blue-400 transition-colors break-all flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4 flex-shrink-0" />
                  {project.video_url}
                </a>
              </div>
            )}
          </div>

          {/* ── STALLED + No Clips: Failure State ── */}
          {isStalledNoClips && (
            <div className="card p-6 border-energy/30 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-energy flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-primary">No clips were rendered</h3>
                  <p className="text-sm text-secondary mt-1">
                    {ERROR_MESSAGES.no_clips_rendered} Credits are usually returned by OpusClip for failed projects. Try again with safer settings.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="primary" onClick={() => handleRetry(true)} loading={retrying} disabled={retrying}>
                  <Zap className="w-4 h-4 mr-2" />
                  Retry Safe Mode
                </Button>
                <Button variant="secondary" onClick={() => handleRetry(false)} disabled={retrying}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry with ClipAnything
                </Button>
                <Button variant="secondary" onClick={() => router.push('/')}>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Change Video URL
                </Button>
                <Button variant="ghost" onClick={() => router.push(`/api-logs?projectId=${params.projectId}`)}>
                  <FileText className="w-4 h-4 mr-2" />
                  View API Logs
                </Button>
              </div>
            </div>
          )}

          {/* ── STALLED + Has Clips ── */}
          {isStalledWithClips && (
            <div className="bg-energy/10 border border-energy/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-energy flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-primary font-medium">Processing stalled, but some clips are available.</p>
                <p className="text-xs text-secondary mt-1">You can use the available clips below or retry for more.</p>
              </div>
            </div>
          )}

          {/* ── FAILED State ── */}
          {isFailed && (
            <div className="card p-6 border-alert/30 space-y-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-6 h-6 text-alert flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-primary">Processing Failed</h3>
                  <p className="text-sm text-secondary mt-1">
                    OpusClip could not process this video. Check the API logs for details.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="primary" onClick={() => handleRetry(true)} loading={retrying} disabled={retrying}>
                  <Zap className="w-4 h-4 mr-2" />
                  Retry Safe Mode
                </Button>
                <Button variant="secondary" onClick={() => router.push('/')}>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Change Video URL
                </Button>
                <Button variant="ghost" onClick={() => router.push(`/api-logs?projectId=${params.projectId}`)}>
                  <FileText className="w-4 h-4 mr-2" />
                  View API Logs
                </Button>
              </div>
            </div>
          )}

          {/* ── Active processing banner ── */}
          {!isTerminal && (
            <div className="flex items-center gap-2 px-4 py-3 bg-accent/10 text-accent rounded-lg text-sm">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>
                {getStageLabel(project.stage)} — {getProjectProgress(project.stage)}% complete. This page updates
                automatically.
              </span>
            </div>
          )}

          {/* ── Action Buttons ── */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={handleSyncClips}
              loading={syncing}
              disabled={syncing}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {syncing ? 'Syncing Clips...' : 'Sync Clips'}
            </Button>

            {isTerminal && !isFailed && !isStalledNoClips && (
              <Button variant="secondary" onClick={() => handleRetry(false)} disabled={retrying}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry Project
              </Button>
            )}

            <Button variant="ghost" onClick={() => router.push(`/api-logs?projectId=${params.projectId}`)}>
              <FileText className="w-4 h-4 mr-2" />
              API Logs
            </Button>

            {!isTerminal && (
              <Button variant="ghost" onClick={() => fetchProjectData()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Manual Refresh
              </Button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-4 text-sm text-alert" role="alert">
              {error}
            </div>
          )}

          {/* ── Clips Section ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary">Clips ({clips.length})</h2>
            </div>

            {clips.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {clips.map((clip) => (
                  <ClipCard key={clip.id} clip={clip} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Film className="w-16 h-16" />}
                title={
                  isStalledNoClips || isFailed
                    ? 'No clips were rendered'
                    : project.stage === 'COMPLETE'
                      ? 'No clips found'
                      : 'No clips yet'
                }
                description={
                  isStalledNoClips || isFailed
                    ? 'OpusClip could not generate clips. Try again with safer settings using the retry buttons above.'
                    : project.stage === 'COMPLETE'
                      ? 'Click "Sync Clips" to fetch clips from OpusClip.'
                      : 'Clips will be available once processing is complete.'
                }
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
