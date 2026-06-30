'use client';

import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import Button from '@/components/ui/Button';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * Export settings panel (spec Section F export settings). Lets the user trigger
 * a re-render of the edited clip through the RENDER_CLIP worker job. Shows the
 * live render status and, once complete, a download button for the fresh output.
 */
export default function ExportPanel() {
  const { clipId, renderStatus, renderError, export: doExport, resetRenderStatus, videoUrl } = useEditorStore();
  const [resolution, setResolution] = useState('1080x1920');
  const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('standard');

  const handleExport = async () => {
    try {
      await doExport();
    } catch {
      /* error surfaced via renderStatus */
    }
  };

  const handleDownload = () => {
    if (clipId) window.open(`/api/clips/${clipId}/video`, '_blank');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-primary">Export Settings</h3>

      <div className="space-y-2">
        <label className="block text-xs text-secondary">Resolution</label>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
        >
          <option value="1080x1920">1080×1920 (Portrait)</option>
          <option value="1080x1080">1080×1080 (Square)</option>
          <option value="1920x1080">1920×1080 (Landscape)</option>
          <option value="720x1280">720×1280 (Lower)</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-secondary">Quality</label>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value as 'draft' | 'standard' | 'high')}
          className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
        >
          <option value="draft">Draft (faster)</option>
          <option value="standard">Standard</option>
          <option value="high">High (slower)</option>
        </select>
      </div>

      <div className="text-xs text-secondary bg-canvas rounded-lg p-2.5">
        Export re-renders the clip with your current editor settings (caption style, hook, layout) via FFmpeg. This does not modify the original video.
      </div>

      {renderStatus === 'idle' && (
        <Button variant="primary" size="md" className="w-full" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export &amp; Render
        </Button>
      )}

      {renderStatus === 'rendering' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-accent">
            <Loader2 className="w-4 h-4 animate-spin" />
            Rendering… this may take a few minutes.
          </div>
          <Button variant="secondary" size="sm" className="w-full" disabled>
            In progress
          </Button>
        </div>
      )}

      {renderStatus === 'completed' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle className="w-4 h-4" />
            Render complete!
          </div>
          <Button variant="primary" size="md" className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download Final Clip
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={resetRenderStatus}>
            Export again
          </Button>
        </div>
      )}

      {renderStatus === 'failed' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-alert">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{renderError || 'Render failed.'}</span>
          </div>
          <Button variant="secondary" size="sm" className="w-full" onClick={handleExport}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
