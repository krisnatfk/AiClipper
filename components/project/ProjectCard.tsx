'use client';

import Link from 'next/link';
import { Project } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import { formatDate, formatBytes } from '@/lib/utils';
import { ExternalLink, RefreshCw, RotateCcw, Film } from 'lucide-react';

const FAILED_STAGES = new Set(['STALLED', 'FAILED']);

export interface ProjectCardProps {
  project: Project;
  onRefresh?: (projectId: string) => void;
}

export default function ProjectCard({
  project,
  onRefresh,
}: ProjectCardProps) {
  const isFailed = FAILED_STAGES.has(project.stage);

  return (
    <div className={`card p-4 space-y-4 ${isFailed ? 'border-alert/20' : ''}`}>
      {/* Thumbnail */}
      <Link
        href={`/projects/${project.project_id}`}
        className="block aspect-video bg-sidebar rounded-lg overflow-hidden relative group"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Film className="w-12 h-12 text-secondary/30" />
        </div>
        <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors" />
        {/* Failed Overlay */}
        {isFailed && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 text-[10px] font-semibold bg-alert/90 text-white rounded">
              {project.stage === 'STALLED' ? 'STALLED' : 'FAILED'}
            </span>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="space-y-2">
        {/* Title */}
        <Link href={`/projects/${project.project_id}`} className="block">
          <h3 className="text-base font-semibold text-primary hover:text-accent transition-colors line-clamp-2">
            {project.title}
          </h3>
        </Link>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
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

        {/* Project ID */}
        <div className="text-xs text-secondary font-mono truncate">
          {project.project_id}
        </div>

        {/* Dates and Storage */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-secondary">
          <div>Created {formatDate(project.created_at)}</div>
          {project.storage_size ? (
            <div>{formatBytes(project.storage_size)}</div>
          ) : null}
          {project.storage_expire_at ? (
            <div className="text-energy">
              Expires {formatDate(project.storage_expire_at)}
            </div>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link href={`/projects/${project.project_id}`} className="flex-1">
          <Button variant="primary" size="sm" className="w-full">
            <ExternalLink className="w-4 h-4 mr-1" />
            Open
          </Button>
        </Link>

        {isFailed && (
          <Link href={`/projects/${project.project_id}`}>
            <Button
              variant="secondary"
              size="sm"
              title="Retry project"
              className="text-energy border-energy/30"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </Link>
        )}

        {onRefresh && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRefresh(project.project_id)}
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
