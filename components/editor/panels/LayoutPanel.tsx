'use client';

import { useState } from 'react';
import { Crosshair, Loader2 } from 'lucide-react';
import { useEditorStore, LayoutMode, ReframeMode } from '@/store/editorStore';

export default function LayoutPanel() {
  const { clipId, layoutConfig, setLayoutConfig } = useEditorStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);

  const layoutModes: { id: LayoutMode, label: string }[] = [
    { id: 'full', label: 'Full Screen (Portrait)' },
    { id: 'fit', label: 'Fit with Blur' },
    { id: 'split-top-bottom', label: 'Split Top/Bottom' },
    { id: 'split-speaker-screen', label: 'Split Speaker/Screen' },
    { id: 'crop', label: 'Manual Crop' },
    { id: 'square', label: 'Square 1:1' },
    { id: 'landscape', label: 'Landscape 16:9' },
  ];

  const reframeModes: { id: ReframeMode; label: string; layoutMode: LayoutMode }[] = [
    { id: 'face-center-crop', label: 'Face Center', layoutMode: 'full' },
    { id: 'person-center-crop', label: 'Person Center', layoutMode: 'full' },
    { id: 'fit-blur', label: 'Fit Blur', layoutMode: 'fit' },
    { id: 'manual-crop', label: 'Manual Crop', layoutMode: 'crop' },
    { id: 'manual-keyframe', label: 'Manual Keyframe', layoutMode: 'crop' },
  ];

  const selectReframeMode = async (mode: ReframeMode, layoutMode: LayoutMode) => {
    setLayoutConfig({
      mode: layoutMode,
      aspectRatio: '9:16',
      reframeMode: mode,
      fallbackMode: 'fit-blur',
    });

    if (!clipId) return;
    await fetch(`/api/clips/${clipId}/reframe`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, fallbackMode: 'fit-blur' }),
    }).catch(() => {});
  };

  const analyzeReframe = async () => {
    if (!clipId) return;
    setAnalyzing(true);
    setAnalysisStatus(null);
    try {
      const res = await fetch(`/api/clips/${clipId}/reframe/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: layoutConfig.reframeMode || 'face-center-crop' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Analyze failed');
      setLayoutConfig({
        reframeMode: data.data.mode,
        mode: data.data.mode === 'fit-blur' ? 'fit' : 'full',
      });
      setAnalysisStatus(`${data.data.mode.replace(/-/g, ' ')} · ${data.data.sampledFrames} samples`);
    } catch (error) {
      setAnalysisStatus(error instanceof Error ? error.message : 'Analyze failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Auto Reframe</label>
        <div className="grid grid-cols-1 gap-2">
          {reframeModes.map(mode => (
            <button
              key={mode.id}
              onClick={() => selectReframeMode(mode.id, mode.layoutMode)}
              className={`p-2 rounded text-sm text-left transition-colors border ${
                layoutConfig.reframeMode === mode.id
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-canvas hover:bg-canvas/80 text-secondary'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={analyzeReframe}
          disabled={analyzing || !clipId}
          className="w-full py-2 bg-primary text-black font-semibold rounded text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
          Analyze Face / Person
        </button>
        {analysisStatus && (
          <div className="text-xs text-secondary bg-canvas border border-border rounded p-2">
            {analysisStatus}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Layout Mode</label>
        <div className="grid grid-cols-1 gap-2">
          {layoutModes.map(mode => (
            <button
              key={mode.id}
              onClick={() => setLayoutConfig({ mode: mode.id, aspectRatio: mode.id === 'square' ? '1:1' : mode.id === 'landscape' ? '16:9' : '9:16' })}
              className={`p-2 rounded text-sm text-left transition-colors border ${
                layoutConfig.mode === mode.id 
                  ? 'border-primary bg-primary/10 text-primary font-medium' 
                  : 'border-border bg-canvas hover:bg-canvas/80 text-secondary'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {layoutConfig.mode === 'split-top-bottom' && (
        <div className="space-y-4 p-4 border border-border rounded bg-canvas">
          <div className="text-xs font-semibold text-secondary">Split Configuration (MVP)</div>
          
          <div className="text-xs text-secondary mb-2">
            In MVP, the split layout simply stacks two cropped areas of the original video.
          </div>
          
          {/* Top Region */}
          <div className="space-y-2">
             <label className="text-xs font-semibold text-primary">Top Region (Y Offset %)</label>
             <input 
               type="range" 
               min="0" max="50"
               className="w-full"
               value={layoutConfig.topRegion ? (layoutConfig.topRegion.y / 1080) * 100 : 0}
               onChange={(e) => {
                 const pct = parseFloat(e.target.value);
                 setLayoutConfig({ 
                   topRegion: { x: 0, y: (pct/100)*1080, width: 1920, height: 1080/2 } 
                 });
               }}
             />
          </div>

          {/* Bottom Region */}
          <div className="space-y-2">
             <label className="text-xs font-semibold text-primary">Bottom Region (Y Offset %)</label>
             <input 
               type="range" 
               min="50" max="100"
               className="w-full"
               value={layoutConfig.bottomRegion ? (layoutConfig.bottomRegion.y / 1080) * 100 : 50}
               onChange={(e) => {
                 const pct = parseFloat(e.target.value);
                 setLayoutConfig({ 
                   bottomRegion: { x: 0, y: (pct/100)*1080, width: 1920, height: 1080/2 } 
                 });
               }}
             />
          </div>
        </div>
      )}
    </div>
  );
}
