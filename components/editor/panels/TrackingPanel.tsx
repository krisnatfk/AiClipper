'use client';

import { useEditorStore, OverlayLayer } from '@/store/editorStore';
import { Plus, Trash2, Crosshair } from 'lucide-react';

export default function TrackingPanel() {
  const { overlayLayers, addOverlayLayer, removeOverlayLayer, updateOverlayLayer, currentTime, duration } = useEditorStore();

  const highlightLayers = overlayLayers.filter(l => l.type === 'highlight');

  const handleAddHighlight = () => {
    addOverlayLayer({
      type: 'highlight',
      startTime: currentTime,
      endTime: Math.min(currentTime + 5, duration),
      zIndex: 10,
      config: {
        x: 20,
        y: 20,
        width: 30,
        height: 30,
        borderColor: '#FACC15',
        borderWidth: 4,
        label: 'Highlight',
        keyframes: [] // Array of { time, x, y, width, height }
      }
    });
  };

  const handleAddKeyframe = (layer: OverlayLayer) => {
    const kfs = layer.config.keyframes || [];
    const newKf = {
      time: currentTime,
      x: layer.config.x,
      y: layer.config.y,
      width: layer.config.width,
      height: layer.config.height
    };
    
    // Sort keyframes by time
    const updatedKfs = [...kfs.filter((k: any) => Math.abs(k.time - currentTime) > 0.1), newKf]
      .sort((a, b) => a.time - b.time);
      
    updateOverlayLayer(layer.id, {
      config: { ...layer.config, keyframes: updatedKfs }
    });
  };

  const updateProp = (layerId: string, prop: string, value: number) => {
    const layer = overlayLayers.find(l => l.id === layerId);
    if (!layer) return;
    updateOverlayLayer(layerId, {
      config: { ...layer.config, [prop]: value }
    });
  };

  return (
    <div className="space-y-4">
      <button 
        onClick={handleAddHighlight}
        className="w-full py-2 bg-primary text-black font-semibold rounded text-sm hover:bg-primary/90 flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Highlight Box
      </button>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Highlight Layers</label>
        {highlightLayers.length === 0 ? (
          <div className="text-xs text-secondary italic">No highlights added yet.</div>
        ) : (
          highlightLayers.map(layer => (
            <div key={layer.id} className="p-3 border border-border rounded bg-canvas flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{layer.config.label || 'Box'}</span>
                <button 
                  onClick={() => removeOverlayLayer(layer.id)}
                  className="text-red-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-secondary block mb-1">X (%)</label>
                  <input type="range" min="0" max="100" value={layer.config.x} onChange={(e) => updateProp(layer.id, 'x', parseFloat(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="text-secondary block mb-1">Y (%)</label>
                  <input type="range" min="0" max="100" value={layer.config.y} onChange={(e) => updateProp(layer.id, 'y', parseFloat(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="text-secondary block mb-1">Width (%)</label>
                  <input type="range" min="1" max="100" value={layer.config.width} onChange={(e) => updateProp(layer.id, 'width', parseFloat(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="text-secondary block mb-1">Height (%)</label>
                  <input type="range" min="1" max="100" value={layer.config.height} onChange={(e) => updateProp(layer.id, 'height', parseFloat(e.target.value))} className="w-full" />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-xs text-secondary">
                  Keyframes: {layer.config.keyframes?.length || 0}
                </div>
                <button 
                  onClick={() => handleAddKeyframe(layer)}
                  className="text-xs bg-sidebar border border-border px-2 py-1 rounded hover:bg-canvas flex items-center gap-1"
                >
                  <Crosshair className="w-3 h-3" />
                  Record at {currentTime.toFixed(1)}s
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
