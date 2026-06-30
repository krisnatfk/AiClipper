'use client';

import { useEditorStore } from '@/store/editorStore';

export default function CaptionPanel() {
  const { captionStyle, setCaptionStyle } = useEditorStore();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Font Family</label>
        <select 
          className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
          value={captionStyle.fontFamily}
          onChange={(e) => setCaptionStyle({ fontFamily: e.target.value })}
        >
          <option value="Inter">Inter</option>
          <option value="Roboto">Roboto</option>
          <option value="Outfit">Outfit</option>
          <option value="Montserrat">Montserrat</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Font Size</label>
          <input 
            type="number" 
            className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
            value={captionStyle.fontSize}
            onChange={(e) => setCaptionStyle({ fontSize: parseInt(e.target.value) || 58 })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Max Words / Line</label>
          <input 
            type="number" 
            className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
            value={captionStyle.maxWordsPerLine}
            onChange={(e) => setCaptionStyle({ maxWordsPerLine: parseInt(e.target.value) || 4 })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Text Color</label>
          <div className="flex gap-2">
            <input 
              type="color" 
              className="w-8 h-8 rounded cursor-pointer bg-canvas"
              value={captionStyle.textColor}
              onChange={(e) => setCaptionStyle({ textColor: e.target.value })}
            />
            <input 
              type="text" 
              className="flex-1 bg-canvas border border-border rounded p-1 text-sm text-primary uppercase"
              value={captionStyle.textColor}
              onChange={(e) => setCaptionStyle({ textColor: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-secondary">Highlight Color</label>
          <div className="flex gap-2">
            <input 
              type="color" 
              className="w-8 h-8 rounded cursor-pointer bg-canvas"
              value={captionStyle.highlightColor}
              onChange={(e) => setCaptionStyle({ highlightColor: e.target.value })}
            />
             <input 
              type="text" 
              className="flex-1 bg-canvas border border-border rounded p-1 text-sm text-primary uppercase"
              value={captionStyle.highlightColor}
              onChange={(e) => setCaptionStyle({ highlightColor: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Stroke & Shadow</label>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={captionStyle.strokeWidth > 0} 
              onChange={(e) => setCaptionStyle({ strokeWidth: e.target.checked ? 8 : 0 })}
            />
            Stroke
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={captionStyle.shadow} 
              onChange={(e) => setCaptionStyle({ shadow: e.target.checked })}
            />
            Shadow
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={captionStyle.uppercase} 
              onChange={(e) => setCaptionStyle({ uppercase: e.target.checked })}
            />
            Uppercase
          </label>
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="text-xs font-semibold text-secondary">Position</label>
        <select 
          className="w-full bg-canvas border border-border rounded p-2 text-sm text-primary"
          value={captionStyle.position}
          onChange={(e) => setCaptionStyle({ position: e.target.value as 'top' | 'middle' | 'bottom' })}
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
    </div>
  );
}
