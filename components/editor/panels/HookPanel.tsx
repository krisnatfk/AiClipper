'use client';

import { useEditorStore } from '@/store/editorStore';

export default function HookPanel() {
  const { hookStyle, setHookStyle } = useEditorStore();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Hook Text</label>
        <textarea 
          className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary min-h-[80px]"
          placeholder="Enter your hook text here..."
          value={hookStyle.text}
          onChange={(e) => setHookStyle({ text: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Start Time (s)</label>
          <input 
            type="number" 
            step="0.1"
            className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
            value={hookStyle.startTime}
            onChange={(e) => setHookStyle({ startTime: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">End Time (s)</label>
          <input 
            type="number" 
            step="0.1"
            className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
            value={hookStyle.endTime}
            onChange={(e) => setHookStyle({ endTime: parseFloat(e.target.value) || 4 })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Font Size</label>
          <input 
            type="number" 
            className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
            value={hookStyle.fontSize}
            onChange={(e) => setHookStyle({ fontSize: parseInt(e.target.value) || 72 })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Position</label>
          <select 
            className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
            value={hookStyle.position}
            onChange={(e) => setHookStyle({ position: e.target.value as 'top' | 'middle' | 'bottom' })}
          >
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Text Color</label>
          <div className="flex gap-2">
            <input 
              type="color" 
              className="w-8 h-8 rounded cursor-pointer bg-canvas"
              value={hookStyle.textColor}
              onChange={(e) => setHookStyle({ textColor: e.target.value })}
            />
            <input 
              type="text" 
              className="flex-1 bg-canvas border border-border rounded p-1 text-sm text-primary uppercase"
              value={hookStyle.textColor}
              onChange={(e) => setHookStyle({ textColor: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Background</label>
          <div className="flex gap-2">
            <input 
              type="color" 
              className="w-8 h-8 rounded cursor-pointer bg-canvas"
              value={hookStyle.backgroundColor.slice(0,7)} // naive slice for hex without alpha
              onChange={(e) => setHookStyle({ backgroundColor: e.target.value + 'FF' })} // add opaque alpha
            />
             <input 
              type="text" 
              className="flex-1 bg-canvas border border-border rounded p-1 text-sm text-primary uppercase"
              value={hookStyle.backgroundColor}
              onChange={(e) => setHookStyle({ backgroundColor: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
