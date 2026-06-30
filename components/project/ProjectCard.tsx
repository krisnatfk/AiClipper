'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Project } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import ProgressBar from '@/components/ui/ProgressBar';
import Button from '@/components/ui/Button';
import ProjectCardMenu from './ProjectCardMenu';
import DeleteProjectModal from './DeleteProjectModal';
import { formatDate, formatBytes } from '@/lib/utils';
import { humanStatusLabel, formatEta, isTerminalStatus } from '@/lib/processing/status';
import { Film, ExternalLink, RotateCcw } from 'lucide-react';

const FAILED_STAGES = new Set(['STALLED', 'FAILED', 'PARTIAL_COMPLETED']);
const PROCESSING_STATUSES = new Set([
  'QUEUED', 'PROBING', 'EXTRACTING_AUDIO', 'TRANSCRIBING',
  'ANALYZING', 'PLANNING_CLIPS', 'RENDERING', 'UPLOADING_OUTPUT',
]);

export interface ProjectCardProps {
  project: Project;
  onDeleted?: (projectId: string) => void;
  onRetry?: (projectId: string) => void;
}

export default function ProjectCard({ project, onDeleted, onRetry }: ProjectCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const displayStatus = project.status || project.stage;
  const isFailed = FAILED_STAGES.has(displayStatus);
  const isProcessing = PROCESSING_STATUSES.has(displayStatus);
  const isDraft = displayStatus === 'DRAFT' || displayStatus === 'UPLOADED';
  const etaLabel = formatEta(
    isProcessing ? (PROJECT_ETA as Record<string, number | undefined>)[displayStatus] ?? null : null
  );

  const handleRetry = () => {
    if (onRetry) {
      onRetry(project.project_id);
    } else {
      // Default: hit the retry endpoint then reload.
      fetch(`/api/projects/${project.project_id}/retry`, { method: 'POST' })
        .then(() => window.location.reload())
        .catch(() => {});
    }
  };

  return (
    <>
      <div className={`card p-4 space-y-3 ${isFailed ? 'border-alert/20' : ''}`}>
        {/* Thumbnail + menu */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/projects/${project.project_id}`}
            className="block aspect-video bg-sidebar rounded-lg overflow-hidden relative group flex-1"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="w-10 h-10 text-secondary/30" />
            </div>
            <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors" />
            {isFailed && (
              <div className="absolute top-2 right-2">
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-alert/90 text-white rounded">
                  {displayStatus === 'PARTIAL_COMPLETED' ? 'PARTIAL' : displayStatus === 'STALLED' ? 'STALLED' : 'FAILED'}
                </span>
              </div>
            )}
            {isProcessing && (
              <div className="absolute top-2 right-2">
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-accent/90 text-white rounded animate-pulse">
                  {project.progress ?? 0}%
                </span>
              </div>
            )}
          </Link>

          <ProjectCardMenu
            projectId={project.project_id}
            isFailed={isFailed}
            isDraft={isDraft}
            onRetry={onRetry ? () => onRetry(project.project_id) : handleRetry}
            onDelete={() => setDeleteOpen(true)}
          />
        </div>

        {/* Info */}
        <div className="space-y-2">
          <Link href={`/projects/${project.project_id}`} className="block">
            <h3 className="text-sm font-semibold text-primary hover:text-accent transition-colors line-clamp-2">
              {project.title}
            </h3>
          </Link>

          <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
            <StatusBadge stage={displayStatus} />
            <span>•</span>
            <span>{project.model}</span>
            <span>•</span>
            <span>{project.aspect_ratio}</span>
          </div>

          {/* Progress bar (spec D items 4/5) */}
          {isProcessing && (
            <div className="space-y-1">
              <ProgressBar
                progress={project.progress ?? 0}
                stage={humanStatusLabel(displayStatus)}
                showPercentage
              />
              {etaLabel && (
                <div className="text-[11px] text-secondary">
                  ETA: {etaLabel}
                </div>
              )}
            </div>
          )}

          {/* Failed message + retry (spec N) */}
          {isFailed && (
            <div className="space-y-2">
              <p className="text-xs text-alert line-clamp-2">
                {project.error_message || 'Processing failed. Try again or adjust settings.'}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                className="text-energy border-energy/30 w-full"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Retry
              </Button>
            </div>
          )}

          {/* Dates + storage */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-secondary">
            <div>Created {formatDate(project.created_at)}</div>
            {(project.storage_size || project.file_size) && (
              <div>{formatBytes(project.storage_size || project.file_size || 0)}</div>
            )}
          </div>
        </div>

        {/* Open button */}
        <Link href={`/projects/${project.project_id}`} className="block">
          <Button variant="primary" size="sm" className="w-full">
            <ExternalLink className="w-4 h-4 mr-1" />
            Open
          </Button>
        </Link>
      </div>

      <DeleteProjectModal
        project={project}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onDeleted}
      />
    </>
  );
}

// ETA heuristic per active status (seconds). Kept in sync with lib/processing/status.
const PROJECT_ETA: Record<string, number> = {
  QUEUED: 30,
  PROBING: 10,
  EXTRACTING_AUDIO: 20,
  TRANSCRIBING: 120,
  ANALYZING: 60,
  PLANNING_CLIPS: 15,
  RENDERING: 180,
  UPLOADING_OUTPUT: 20,
};
