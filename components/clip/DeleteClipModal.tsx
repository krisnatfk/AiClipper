'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Clip } from '@/types';

type Scope = 'record' | 'file';

const SCOPE_OPTIONS: { id: Scope; label: string; description: string }[] = [
  {
    id: 'record',
    label: 'Remove from project only',
    description: 'Delete the clip record and its editor config from the database. Keep the rendered video file.',
  },
  {
    id: 'file',
    label: 'Delete rendered video file too',
    description: 'Delete the clip record AND remove the rendered output video, thumbnail, and subtitle files from storage.',
  },
];

interface DeleteClipModalProps {
  clip: Clip;
  open: boolean;
  onClose: () => void;
  onDeleted?: (clipId: string) => void;
}

/**
 * Delete clip confirmation modal (spec Section I). Two scope options mapping to
 * the ?delete_file= query on DELETE /api/clips/:id.
 */
export default function DeleteClipModal({
  clip,
  open,
  onClose,
  onDeleted,
}: DeleteClipModalProps) {
  const [scope, setScope] = useState<Scope>('file');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleDelete = async () => {
    setError('');
    setLoading(true);
    try {
      const clipId = clip.clip_id || `clip-${clip.id}`;
      const res = await fetch(`/api/clips/${clipId}?delete_file=${scope === 'file'}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to delete clip');
      onDeleted?.(clipId);
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
            <h2 className="text-lg font-semibold text-primary">Delete this clip?</h2>
            <p className="text-sm text-secondary mt-1">
              “{clip.title}” will be removed. Choose whether to keep or delete the rendered video file.
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
                name="clip-delete-scope"
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
            Delete Clip
          </Button>
        </div>
      </div>
    </div>
  );
}
