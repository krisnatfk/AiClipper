'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import ClipCard from '@/components/clip/ClipCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ProgressBar from '@/components/ui/ProgressBar';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { ClipCardSkeleton } from '@/components/ui/LoadingSkeleton';
import type { Clip, Project } from '@/types';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  FileText,
  Film,
  RefreshCw,
  Share2,
  XCircle,
  Trash2,
  Settings2,
  Scissors,
} from 'lucide-react';

const POLL_INTERVAL_MS = 20_000;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'PARTIAL_COMPLETED', 'FAILED', 'CANCELED', 'COMPLETE', 'STALLED']);

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  UPLOADED: 'Video uploaded',
  QUEUED: 'Waiting for worker',
  PROBING: 'Reading video metadata',
  EXTRACTING_AUDIO: 'Extracting audio',
  TRANSCRIBING: 'Waiting for transcription',
  ANALYZING: 'Finding highlight moments',
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

interface ProcessingLog {
  id: number;
  level: string;
  step: string;
  message: string;
  created_at: string;
}

interface TranscriptData {
  id: number;
  language: string | null;
  full_text: string | null;
  segments: unknown;
}

function getDisplayStatus(project: Project | null, clips: Clip[]) {
  if (clips.length > 0 && project?.status === 'COMPLETED') return 'COMPLETED';
  return project?.status || project?.stage || 'PENDING';
}

function getStatusLabel(status: string) {
  return statusLabels[status] || `Processing: ${status}`;
}

export default function ProjectDetailPage({
  params,
}: {
  params: { projectId: string };
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayStatus = getDisplayStatus(project, clips);
  const isTerminal = TERMINAL_STATUSES.has(displayStatus);
  const isFailed = displayStatus === 'FAILED' || displayStatus === 'STALLED';
  const isUploadedSource = project?.source_type === 'upload';

  const fetchProjectData = useCallback(
    async (isBackgroundPoll = false) => {
      try {
        if (isBackgroundPoll) {
          setPolling(true);
        } else {
          setLoading(true);
        }
        setError('');

        // Fetch project + clips + logs in parallel. Transcript is fetched
        // conditionally below — only once the project has reached the
        // TRANSCRIBING step or beyond (avoiding pointless DB hits during
        // DRAFT / QUEUED / PROBING).
        const [projectRes, clipsRes, logsRes] = await Promise.all([
          fetch(`/api/projects/${params.projectId}`),
          fetch(`/api/projects/${params.projectId}/clips`),
          fetch(`/api/projects/${params.projectId}/logs`),
        ]);

        if (!projectRes.ok) throw new Error('Failed to fetch project');
        const projectData = await projectRes.json();
        setProject(projectData.data);
        setLastUpdatedAt(new Date());

        if (clipsRes.ok) {
          const clipsData = await clipsRes.json();
          setClips(clipsData.data || []);
        }

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData.data || []);
        }

        // Only fetch transcript once transcription has started or completed.
        const projStatus = projectData.data?.status || projectData.data?.stage || '';
        const hasTranscript = [
          'TRANSCRIBING', 'ANALYZING', 'PLANNING_CLIPS', 'RENDERING',
          'UPLOADING_OUTPUT', 'COMPLETED', 'PARTIAL_COMPLETED',
          'COMPLETE', 'STALLED',
        ].includes(projStatus);

        if (hasTranscript) {
          const transcriptRes = await fetch(`/api/projects/${params.projectId}/transcript`);
          if (transcriptRes.ok) {
            const transcriptData = await transcriptRes.json();
            setTranscript(transcriptData.data || null);
          } else {
            setTranscript(null);
          }
        } else {
          setTranscript(null);
        }

        if (projectData.meta?.isTerminal && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
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

  useEffect(() => {
    fetchProjectData();
  }, [fetchProjectData]);

  useEffect(() => {
    if (!project || isTerminal) {
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
  }, [fetchProjectData, isTerminal, project]);

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-full bg-canvas p-4 lg:p-8">
          <div className="max-w-7xl mx-auto animate-pulse space-y-6">
            <div className="h-8 bg-card rounded w-1/3" />
            <div className="h-64 bg-card rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ClipCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error && !project) {
    return (
      <AppShell>
        <div className="min-h-full bg-canvas p-4 lg:p-8">
          <div className="max-w-7xl mx-auto bg-alert/10 border border-alert/20 rounded-lg p-6 text-center">
            <p className="text-alert">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={() => router.push('/projects')}>
              Back to Projects
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!project) return null;

  const transcriptSegments = Array.isArray(transcript?.segments)
    ? transcript.segments.filter((segment): segment is { start: number; end: number; text: string } => (
        typeof segment === 'object' &&
        segment !== null &&
        'text' in segment
      ))
    : [];

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>

          <div className="card p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-primary mb-2 break-words">
                  {project.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-secondary">
                  <StatusBadge stage={displayStatus} />
                  <span>•</span>
                  <span>{project.model}</span>
                  <span>•</span>
                  <span>{project.aspect_ratio}</span>
                </div>
              </div>
              <Button variant="secondary" size="sm" title="Share project">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-secondary mb-1">Project ID</div>
                <div className="text-sm text-primary font-mono truncate">{project.project_id}</div>
              </div>
              <div>
                <div className="text-xs text-secondary mb-1">Created</div>
                <div className="text-sm text-primary">{formatDate(project.created_at)}</div>
              </div>
              <div>
                <div className="text-xs text-secondary mb-1">Storage</div>
                <div className="text-sm text-primary">
                  {project.storage_size || project.file_size ? formatBytes(project.storage_size || project.file_size || 0) : 'Pending'}
                </div>
              </div>
              <div>
                <div className="text-xs text-secondary mb-1">Duration</div>
                <div className="text-sm text-primary">
                  {project.duration_seconds ? `${project.duration_seconds}s` : 'Waiting for probe'}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-primary">Processing Progress</div>
                  <div className="text-xs text-secondary mt-0.5">
                    {project.current_step || getStatusLabel(displayStatus)}
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

              <ProgressBar
                progress={project.progress ?? 0}
                stage={getStatusLabel(displayStatus)}
                showPercentage
              />
            </div>

            <div className="pt-4 border-t border-border">
              <div className="text-xs text-secondary mb-2">Source Video</div>
              {isUploadedSource ? (
                <div className="text-sm text-primary">
                  Uploaded video is stored in local storage for worker processing.
                </div>
              ) : project.source_url || project.video_url ? (
                <a
                  href={project.source_url || project.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:text-blue-400 transition-colors break-all flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4 flex-shrink-0" />
                  {project.source_url || project.video_url}
                </a>
              ) : (
                <div className="text-sm text-secondary">No source attached</div>
              )}
            </div>
          </div>

          {!isTerminal && (
            <div className="flex items-center gap-2 px-4 py-3 bg-accent/10 text-accent rounded-lg text-sm">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>
                {project.current_step || getStatusLabel(displayStatus)} • {project.progress ?? 0}% complete.
              </span>
            </div>
          )}

          {isFailed && (
            <div className="card p-6 border-alert/30 flex items-start gap-3">
              <XCircle className="w-6 h-6 text-alert flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-primary">Processing Failed</h3>
                <p className="text-sm text-secondary mt-1">
                  {project.error_message || 'The local processing worker could not complete this project.'}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => fetchProjectData()} disabled={polling}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Status
            </Button>

            {(displayStatus === 'DRAFT' || displayStatus === 'UPLOADED') && (
              <Button variant="secondary" onClick={() => router.push(`/projects/${params.projectId}/configure`)}>
                <Settings2 className="w-4 h-4 mr-2" />
                Configure
              </Button>
            )}

            {(displayStatus === 'COMPLETED' || displayStatus === 'COMPLETE' || displayStatus === 'PARTIAL_COMPLETED') && clips.length > 0 && (
              <Button variant="secondary" onClick={() => router.push(`/projects/${params.projectId}/clips`)}>
                <Scissors className="w-4 h-4 mr-2" />
                View all clips
              </Button>
            )}

            <Button
              variant="secondary"
              className="!text-alert !border-alert/30 hover:!bg-alert/10"
              onClick={() => {
                if (confirm(`Delete project "${project.title}"? This cannot be undone.`)) {
                  fetch(`/api/projects/${params.projectId}?scope=all`, { method: 'DELETE' })
                    .then(() => router.push('/projects'))
                    .catch(() => {});
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Project
            </Button>
          </div>

          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-4 text-sm text-alert" role="alert">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-primary">Clips ({clips.length})</h2>
              </div>

              {clips.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clips.map((clip) => (
                    <ClipCard key={clip.id} clip={clip} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Film className="w-16 h-16" />}
                  title="No clips yet"
                  description="Clips will appear here after transcription, highlight detection, and rendering are complete."
                />
              )}
            </div>

            <div className="space-y-6">
              <section className="card p-4 h-fit">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-primary">Transcript</h2>
                </div>
                {transcript ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>Language: {transcript.language || 'auto'}</span>
                      <span>{transcriptSegments.length} segments</span>
                    </div>
                    <p className="text-sm text-secondary line-clamp-5">
                      {transcript.full_text}
                    </p>
                    <div className="space-y-2">
                      {transcriptSegments.slice(0, 4).map((segment, index) => (
                        <div key={`${segment.start}-${index}`} className="text-xs text-secondary">
                          <span className="font-mono text-accent">
                            {Math.round(segment.start)}s
                          </span>{' '}
                          {segment.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-secondary">
                    Transcript will appear after the transcription worker completes.
                  </p>
                )}
              </section>

              <section className="card p-4 h-fit">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-primary">Processing Logs</h2>
                </div>
                {logs.length > 0 ? (
                  <div className="space-y-3">
                    {logs.slice(0, 8).map((log) => (
                      <div key={log.id} className="border-l-2 border-accent/50 pl-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-primary">{log.step}</span>
                          <span className="text-[10px] text-secondary">{formatDate(log.created_at)}</span>
                        </div>
                        <p className="text-xs text-secondary mt-1">{log.message}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-secondary">No processing logs yet.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
