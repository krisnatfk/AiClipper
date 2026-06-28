'use client';

import { useEffect, useState } from 'react';
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
  Settings,
  ArrowLeft,
} from 'lucide-react';

const stageProgress: Record<string, number> = {
  PENDING: 5,
  QUEUED: 15,
  IMPORT: 25,
  CURATE: 50,
  REFINE: 65,
  RENDER: 80,
  UPLOAD: 90,
  COMPLETE: 100,
  STALLED: 65,
  FAILED: 0,
};

const stageLabels: Record<string, string> = {
  PENDING: 'Preparing project',
  QUEUED: 'Waiting in queue',
  IMPORT: 'Importing source video',
  CURATE: 'Finding best moments',
  REFINE: 'Refining clip selections',
  RENDER: 'Rendering clips',
  UPLOAD: 'Uploading exports',
  COMPLETE: 'Processing complete',
  STALLED: 'Processing stalled',
  FAILED: 'Processing failed',
};

const terminalStages = new Set(['COMPLETE', 'FAILED']);

function getProjectProgress(stage: string): number {
  return stageProgress[stage] ?? 10;
}

function getStageLabel(stage: string): string {
  return stageLabels[stage] ?? `Processing: ${stage}`;
}

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
  const [polling, setPolling] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  // Fetch project and clips data
  useEffect(() => {
    fetchProjectData();
  }, [params.projectId]);

  // Poll status while OpusClip is still processing.
  useEffect(() => {
    if (!project || terminalStages.has(project.stage)) return;

    const intervalId = window.setInterval(() => {
      fetchProjectData(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [project?.stage, params.projectId]);

  const fetchProjectData = async (isBackgroundPoll = false) => {
    try {
      if (isBackgroundPoll) {
        setPolling(true);
      } else {
        setLoading(true);
      }
      setError('');

      // Fetch project
      const projectRes = await fetch(`/api/projects/${params.projectId}`);
      if (!projectRes.ok) {
        throw new Error('Failed to fetch project');
      }
      const projectData = await projectRes.json();
      setProject(projectData.data);
      setLastUpdatedAt(new Date());

      // Fetch clips
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
  };

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

      // Refresh clips after sync
      await fetchProjectData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSyncing(false);
    }
  };

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

  if (error && !project) {
    return (
      <AppShell>
        <div className="min-h-full bg-canvas p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-6 text-center">
              <p className="text-alert">{error}</p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => router.push('/projects')}
              >
                Back to Projects
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Back Button */}
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>

          {/* Project Header */}
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
                <Button
                  variant="secondary"
                  size="sm"
                  title="Project settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  title="Share project"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Project Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border">
              <div>
                <div className="text-xs text-secondary mb-1">Project ID</div>
                <div className="text-sm text-primary font-mono truncate">
                  {project.project_id}
                </div>
              </div>
              <div>
                <div className="text-xs text-secondary mb-1">Created</div>
                <div className="text-sm text-primary">
                  {formatDate(project.created_at)}
                </div>
              </div>
              {project.storage_size && (
                <div>
                  <div className="text-xs text-secondary mb-1">Storage</div>
                  <div className="text-sm text-primary">
                    {formatBytes(project.storage_size)}
                  </div>
                </div>
              )}
              {project.storage_expire_at && (
                <div>
                  <div className="text-xs text-secondary mb-1">Expires</div>
                  <div className="text-sm text-energy">
                    {formatDate(project.storage_expire_at)}
                  </div>
                </div>
              )}
            </div>

            {/* Live Progress */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-primary">
                    Live Processing Progress
                  </div>
                  <div className="text-xs text-secondary mt-0.5">
                    {terminalStages.has(project.stage)
                      ? 'Final status received from OpusClip'
                      : 'Auto-updates every 5 seconds'}
                  </div>
                </div>

                <div className="text-xs text-secondary">
                  {polling ? 'Updating...' : lastUpdatedAt ? `Updated ${lastUpdatedAt.toLocaleTimeString()}` : 'Waiting...'}
                </div>
              </div>

              <ProgressBar
                progress={getProjectProgress(project.stage)}
                stage={getStageLabel(project.stage)}
                showPercentage
              />
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

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={handleSyncClips}
              loading={syncing}
              disabled={project.stage !== 'COMPLETE'}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {syncing ? 'Syncing Clips...' : 'Sync Clips'}
            </Button>

            {!terminalStages.has(project.stage) && (
              <div className="flex items-center gap-2 px-4 py-2 bg-energy/10 text-energy rounded-lg text-sm">
                <Clock className="w-4 h-4" />
                <span>
                  {getStageLabel(project.stage)} — {getProjectProgress(project.stage)}% complete.
                  This page updates automatically.
                </span>
              </div>
            )}

            {project.stage === 'FAILED' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-alert/10 text-alert rounded-lg text-sm">
                <Clock className="w-4 h-4" />
                <span>Processing failed. Check API logs for details.</span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-4 text-sm text-alert">
              {error}
            </div>
          )}

          {/* Clips Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary">
                Clips ({clips.length})
              </h2>
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
                title="No clips yet"
                description={
                  project.stage === 'COMPLETE'
                    ? 'Click "Sync Clips" to fetch clips from the OpusClip API'
                    : 'Clips will be available once the project processing is complete'
                }
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
