'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Project } from '@/types';

type Scope = 'db' | 'clips' | 'all';

const SCOPE_OPTIONS: { id: Scope; label: string; description: string }[] = [
  {
    id: 'db',
    label: 'Delete database record only',
    description: 'Remove the project and clips from the database. Keep all source and output files on disk.',
  },
  {
    id: 'clips',
    label: 'Delete project + generated clips',
    description: 'Remove the project, clips, and generated clip output/thumbnail files. Keep the source video.',
  },
  {
    id: 'all',
    label: 'Delete project + generated clips + source video',
    description: 'Remove everything: project records, clip outputs, and the uploaded source video.',
  },
];

interface DeleteProjectModalProps {
  project: Project;
  open: boolean;
  onClose: () => void;
  onDeleted?: (projectId: string) => void;
}

/**
 * Delete project confirmation modal (spec Section H). Presents three scope
 * options mapping to the ?scope= query of DELETE /api/projects/:id. Cancels any
 * running job server-side and removes related rows + (optionally) files.
 */
export default function DeleteProjectModal({
  project,
  open,
  onClose,
  onDeleted,
}: DeleteProjectModalProps) {
  const [scope, setScope] = useState<Scope>('clips');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleDelete = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.project_id}?scope=${scope}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to delete project');
      onDeleted?.(project.project_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-alert/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-alert" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-primary">Delete this project?</h2>
            <p className="text-sm text-secondary mt-1">
              This will remove the project “{project.title}” and its generated clips. You can choose whether to keep or delete the source/output files.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {SCOPE_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                scope === opt.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
              }`}
            >
              <input
                type="radio"
                name="delete-scope"
                checked={scope === opt.id}
                onChange={() => setScope(opt.id)}
                className="accent-accent mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-primary">{opt.label}</div>
                <div className="text-xs text-secondary mt-0.5">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <div className="bg-alert/10 border border-alert/20 rounded-lg p-2.5 text-sm text-alert">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 !bg-alert hover:!bg-alert/90"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Delete Project
          </Button>
        </div>
      </div>
    </div>
  );
}
