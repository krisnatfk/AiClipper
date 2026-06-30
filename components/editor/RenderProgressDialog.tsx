'use client';

import { useEffect, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import Button from '@/components/ui/Button';
import { Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';

/**
 * Modal that surfaces render progress when the user clicks Export (spec
 * Section F). Polls the clip status via the editor store's pollRenderStatus
 * action and offers a download button once the RENDER_CLIP job completes.
 */
export default function RenderProgressDialog() {
  const { clipId, renderStatus, renderError, resetRenderStatus, videoUrl } = useEditorStore();
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss when starting a new export.
  useEffect(() => {
    if (renderStatus === 'rendering') setDismissed(false);
  }, [renderStatus]);

  if (dismissed || renderStatus === 'idle') return null;

  const open = renderStatus === 'rendering' || renderStatus === 'completed' || renderStatus === 'failed';

  if (!open) return null;

  const handleDownload = () => {
    if (clipId) window.open(`/api/clips/${clipId}/video`, '_blank');
  };

  const handleClose = () => {
    setDismissed(true);
    resetRenderStatus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-primary">
            {renderStatus === 'rendering' && 'Rendering Clip'}
            {renderStatus === 'completed' && 'Render Complete'}
            {renderStatus === 'failed' && 'Render Failed'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-secondary hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {renderStatus === 'rendering' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
            <p className="text-sm text-secondary text-center">
              Re-rendering the clip with your editor settings via FFmpeg. This may take a few minutes depending on clip length.
            </p>
          </div>
        )}

        {renderStatus === 'completed' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-12 h-12 text-success" />
              <p className="text-sm text-secondary text-center">
                Your edited clip has been rendered successfully.
              </p>
            </div>
            <Button variant="primary" className="w-full" onClick={handleDownload}>
              Download Final Clip
            </Button>
          </div>
        )}

        {renderStatus === 'failed' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertCircle className="w-12 h-12 text-alert" />
              <p className="text-sm text-alert text-center">
                {renderError || 'The render could not be completed. Please try again.'}
              </p>
            </div>
            <Button variant="secondary" className="w-full" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
