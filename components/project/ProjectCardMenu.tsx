'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, ExternalLink, Trash2, RotateCcw, Settings } from 'lucide-react';
import Link from 'next/link';

interface ProjectCardMenuProps {
  projectId: string;
  isFailed: boolean;
  isDraft: boolean;
  onRetry?: () => void;
  onDelete: () => void;
}

/**
 * 3-dot dropdown menu for the project card (spec Section D item 8).
 * Options: Open, Configure (draft only), Retry (failed only), Delete.
 */
export default function ProjectCardMenu({
  projectId,
  isFailed,
  isDraft,
  onRetry,
  onDelete,
}: ProjectCardMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-canvas transition-colors"
        aria-label="Project menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-lg z-20 py-1">
          <Link
            href={`/projects/${projectId}`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-canvas transition-colors"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </Link>

          {isDraft && (
            <Link
              href={`/projects/${projectId}/configure`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-canvas transition-colors"
              onClick={() => setOpen(false)}
            >
              <Settings className="w-4 h-4" />
              Configure
            </Link>
          )}

          {isFailed && onRetry && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-energy hover:bg-canvas transition-colors text-left"
              onClick={() => {
                setOpen(false);
                onRetry();
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Retry
            </button>
          )}

          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-alert hover:bg-canvas transition-colors text-left"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
