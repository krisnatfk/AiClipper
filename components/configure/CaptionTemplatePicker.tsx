'use client';

import { useMemo, useState } from 'react';
import type { RenderTemplate } from '@/types';
import { cn } from '@/lib/utils';

interface CaptionTemplatePickerProps {
  templates: RenderTemplate[];
  selectedId: string | null;
  onSelect: (templateId: string | null) => void;
}

/**
 * Caption template picker (spec Section C.11). Two tabs: "Quick presets"
 * (built-in templates) and "My templates" (user-created). Selecting a template
 * renders a live mini-preview of the caption style using the stored JSON.
 */
export default function CaptionTemplatePicker({
  templates,
  selectedId,
  onSelect,
}: CaptionTemplatePickerProps) {
  const [tab, setTab] = useState<'presets' | 'mine'>('presets');

  const presets = useMemo(() => templates.filter((t) => t.is_builtin), [templates]);
  const mine = useMemo(() => templates.filter((t) => !t.is_builtin), [templates]);
  const list = tab === 'presets' ? presets : mine;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('presets')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors',
            tab === 'presets' ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary'
          )}
        >
          Quick presets ({presets.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors',
            tab === 'mine' ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary'
          )}
        >
          My templates ({mine.length})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-secondary italic py-4 text-center">
          {tab === 'mine' ? 'No user templates yet. Create one in the Templates page.' : 'No preset templates found. Run `npm run db:seed-templates`.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
          {list.map((tmpl) => (
            <TemplateCard
              key={tmpl.template_id}
              template={tmpl}
              selected={selectedId === tmpl.template_id}
              onSelect={() => onSelect(tmpl.template_id)}
            />
          ))}
        </div>
      )}

      {selectedId && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs text-secondary hover:text-alert transition-colors"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: RenderTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = template.caption_style;
  const isNoCaption = template.template_id === 'no-caption';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-lg border-2 p-2 text-left transition-all',
        selected ? 'border-accent bg-accent/5' : 'border-border bg-card hover:border-accent/50'
      )}
    >
      {/* Live preview */}
      <div className="aspect-[9/16] bg-black rounded mb-1.5 flex items-end justify-center p-2 overflow-hidden">
        {isNoCaption || !style ? (
          <span className="text-[10px] text-white/40">No caption</span>
        ) : (
          <span
            className="text-center leading-tight"
            style={{
              fontFamily: style.fontFamily || 'Inter',
              fontSize: Math.min(style.fontSize || 16, 16),
              fontWeight: style.fontWeight || 700,
              color: style.textColor || '#FFFFFF',
              WebkitTextStroke: style.strokeWidth ? `${Math.min(style.strokeWidth, 2)}px ${style.strokeColor || '#000000'}` : undefined,
              textTransform: style.uppercase ? 'uppercase' : 'none',
              textShadow: style.shadow ? `1px 1px 2px ${style.shadowColor || '#000000'}` : undefined,
              backgroundColor: style.backgroundColor && style.backgroundColor !== '#00000000' ? style.backgroundColor : undefined,
              padding: style.backgroundColor && style.backgroundColor !== '#00000000' ? '2px 4px' : undefined,
              borderRadius: style.backgroundColor && style.backgroundColor !== '#00000000' ? '4px' : undefined,
            }}
          >
            {style.highlightEnabled ? (
              <>
                <span style={{ color: style.highlightColor || '#22C55E' }}>Viral</span> moment
              </>
            ) : (
              'Viral moment'
            )}
          </span>
        )}
      </div>
      <div className="text-[11px] font-medium text-primary truncate">{template.name}</div>
    </button>
  );
}
