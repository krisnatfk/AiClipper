'use client';

import { useState } from 'react';
import type { RenderTemplate, CaptionStyle } from '@/types';
import Button from '@/components/ui/Button';

interface TemplateEditorProps {
  template: RenderTemplate | null;
  onSave: (data: { templateId?: string; name: string; caption_style: CaptionStyle }) => Promise<void>;
  onCancel: () => void;
}

const FONTS = ['Inter', 'Roboto', 'Outfit', 'Montserrat', 'Poppins', 'Arial'];
const ANIMATIONS = ['none', 'pop', 'fade', 'slide', 'karaoke', 'bounce', 'glitch', 'scale-in'];

const blankStyle: CaptionStyle = {
  fontFamily: 'Inter',
  fontSize: 58,
  fontWeight: 900,
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 8,
  highlightEnabled: true,
  highlightColor: '#22C55E',
  uppercase: true,
  animation: 'pop',
  position: 'bottom',
  maxWordsPerLine: 4,
  shadow: true,
  shadowColor: '#000000',
  backgroundColor: '#00000000',
};

/**
 * Form editor for a caption template's JSON style (spec Section G). Lets the
 * user tweak every caption_style field with a live preview. Used for both
 * creating a new user template and editing an existing one.
 */
export default function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const isEditing = Boolean(template && !template.is_builtin);
  const [name, setName] = useState(template?.name || '');
  const [style, setStyle] = useState<CaptionStyle>(
    (template?.caption_style as CaptionStyle) ?? blankStyle
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) =>
    setStyle((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setError('');
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        templateId: template?.template_id,
        name: name.trim(),
        caption_style: style,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">
          {isEditing ? 'Edit Template' : 'New Template'}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
        {/* Form */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-secondary mb-1">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              placeholder="e.g. My Custom Style"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Font Family</label>
              <select value={style.fontFamily} onChange={(e) => update('fontFamily', e.target.value)} className="input w-full">
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Animation</label>
              <select value={style.animation} onChange={(e) => update('animation', e.target.value as CaptionStyle['animation'])} className="input w-full">
                {ANIMATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Font Size</label>
              <input type="number" value={style.fontSize} onChange={(e) => update('fontSize', Number(e.target.value))} className="input w-full text-center" />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Font Weight</label>
              <input type="number" value={style.fontWeight} onChange={(e) => update('fontWeight', Number(e.target.value))} className="input w-full text-center" step={100} min={100} max={900} />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Max Words/Line</label>
              <input type="number" value={style.maxWordsPerLine} onChange={(e) => update('maxWordsPerLine', Number(e.target.value))} className="input w-full text-center" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Text Color</label>
              <div className="flex gap-2">
                <input type="color" value={style.textColor} onChange={(e) => update('textColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-canvas" />
                <input type="text" value={style.textColor} onChange={(e) => update('textColor', e.target.value)} className="input flex-1" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Highlight Color</label>
              <div className="flex gap-2">
                <input type="color" value={style.highlightColor} onChange={(e) => update('highlightColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-canvas" />
                <input type="text" value={style.highlightColor} onChange={(e) => update('highlightColor', e.target.value)} className="input flex-1" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-secondary mb-1">Stroke Color</label>
              <div className="flex gap-2">
                <input type="color" value={style.strokeColor} onChange={(e) => update('strokeColor', e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-canvas" />
                <input type="text" value={style.strokeColor} onChange={(e) => update('strokeColor', e.target.value)} className="input flex-1" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1">Stroke Width</label>
              <input type="number" value={style.strokeWidth} onChange={(e) => update('strokeWidth', Number(e.target.value))} className="input w-full text-center" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1">Position</label>
            <select value={style.position} onChange={(e) => update('position', e.target.value as CaptionStyle['position'])} className="input w-full">
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-primary">
              <input type="checkbox" checked={style.highlightEnabled} onChange={(e) => update('highlightEnabled', e.target.checked)} className="accent-accent w-4 h-4" />
              Highlight
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-primary">
              <input type="checkbox" checked={style.uppercase} onChange={(e) => update('uppercase', e.target.checked)} className="accent-accent w-4 h-4" />
              Uppercase
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-primary">
              <input type="checkbox" checked={style.shadow} onChange={(e) => update('shadow', e.target.checked)} className="accent-accent w-4 h-4" />
              Shadow
            </label>
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <label className="block text-xs text-secondary">Live Preview</label>
          <div className="aspect-[9/16] bg-black rounded-lg flex items-end justify-center p-3 overflow-hidden">
            <span
              className="text-center leading-tight"
              style={{
                fontFamily: style.fontFamily,
                fontSize: Math.min(style.fontSize, 24),
                fontWeight: style.fontWeight,
                color: style.textColor,
                WebkitTextStroke: style.strokeWidth ? `${Math.min(style.strokeWidth, 2)}px ${style.strokeColor}` : undefined,
                textTransform: style.uppercase ? 'uppercase' : 'none',
                textShadow: style.shadow ? `1px 1px 2px ${style.shadowColor}` : undefined,
                backgroundColor: style.backgroundColor && style.backgroundColor !== '#00000000' ? style.backgroundColor : undefined,
              }}
            >
              {style.highlightEnabled ? (
                <><span style={{ color: style.highlightColor }}>Viral</span> moment</>
              ) : (
                'Viral moment'
              )}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-alert/10 border border-alert/20 rounded-lg p-2.5 text-sm text-alert">{error}</div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" onClick={handleSave} loading={saving}>
          {isEditing ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </div>
  );
}
