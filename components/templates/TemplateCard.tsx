'use client';

import type { RenderTemplate } from '@/types';

interface TemplateCardProps {
  template: RenderTemplate;
  onEdit?: (template: RenderTemplate) => void;
  onSetDefault?: (template: RenderTemplate) => void;
  onDelete?: (template: RenderTemplate) => void;
}

/**
 * Template preview card for the /templates manager page (spec Section G).
 * Renders a live mini-preview of the caption style and exposes edit / set
 * default / delete actions (delete disabled for built-in presets).
 */
export default function TemplateCard({ template, onEdit, onSetDefault, onDelete }: TemplateCardProps) {
  const style = template.caption_style;
  const isNoCaption = template.template_id === 'no-caption';

  return (
    <div className={`card p-4 space-y-3 ${template.is_default ? 'border-accent' : ''}`}>
      {/* Live preview */}
      <div className="aspect-[9/16] bg-black rounded-lg flex items-end justify-center p-3 overflow-hidden max-h-48">
        {isNoCaption || !style ? (
          <span className="text-xs text-white/40">No caption</span>
        ) : (
          <span
            className="text-center leading-tight"
            style={{
              fontFamily: (style as any).fontFamily || 'Inter',
              fontSize: Math.min((style as any).fontSize || 16, 18),
              fontWeight: (style as any).fontWeight || 700,
              color: (style as any).textColor || '#FFFFFF',
              WebkitTextStroke: (style as any).strokeWidth ? `${Math.min((style as any).strokeWidth, 2)}px ${(style as any).strokeColor || '#000000'}` : undefined,
              textTransform: (style as any).uppercase ? 'uppercase' : 'none',
              textShadow: (style as any).shadow ? `1px 1px 2px ${(style as any).shadowColor || '#000000'}` : undefined,
              backgroundColor: (style as any).backgroundColor && (style as any).backgroundColor !== '#00000000' ? (style as any).backgroundColor : undefined,
              padding: (style as any).backgroundColor && (style as any).backgroundColor !== '#00000000' ? '2px 4px' : undefined,
              borderRadius: (style as any).backgroundColor && (style as any).backgroundColor !== '#00000000' ? '4px' : undefined,
            }}
          >
            {(style as any).highlightEnabled ? (
              <>
                <span style={{ color: (style as any).highlightColor || '#22C55E' }}>Viral</span> moment
              </>
            ) : (
              'Viral moment'
            )}
          </span>
        )}
      </div>

      {/* Name + badges */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-primary truncate">{template.name}</h3>
          <div className="flex gap-1 flex-shrink-0">
            {template.is_builtin && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">Preset</span>
            )}
            {template.is_default && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-success/10 text-success">Default</span>
            )}
          </div>
        </div>
        <div className="text-xs text-secondary">
          {style ? `${(style as any).fontFamily || 'Inter'} • ${(style as any).fontSize || 58}px` : 'No style'}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        {onEdit && !template.is_builtin && (
          <button
            type="button"
            onClick={() => onEdit(template)}
            className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-card border border-border text-secondary hover:text-primary hover:border-accent/40 transition-colors"
          >
            Edit
          </button>
        )}
        {onSetDefault && !template.is_default && (
          <button
            type="button"
            onClick={() => onSetDefault(template)}
            className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium bg-card border border-border text-secondary hover:text-primary hover:border-accent/40 transition-colors"
          >
            Set default
          </button>
        )}
        {onDelete && !template.is_builtin && (
          <button
            type="button"
            onClick={() => onDelete(template)}
            className="px-2 py-1.5 rounded-md text-xs font-medium text-alert hover:bg-alert/10 transition-colors"
            title="Delete template"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
