'use client';

import { Gem } from 'lucide-react';
import type { RenderTemplate } from '@/types';
import { cn } from '@/lib/utils';
import CaptionTemplatePreview from './CaptionTemplatePreview';

interface CaptionTemplateCardProps {
  template: RenderTemplate;
  selected: boolean;
  onClick: () => void;
}

export default function CaptionTemplateCard({ template, selected, onClick }: CaptionTemplateCardProps) {
  const style = template.caption_style;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative aspect-square overflow-hidden rounded-xl bg-[#292929] p-3 transition-all hover:bg-[#303030]',
        selected ? 'border-2 border-white shadow-[0_0_0_1px_rgba(255,255,255,0.25)]' : 'border border-[#333]'
      )}
      title={template.name}
    >
      {style?.premium !== false && (
        <span className="absolute right-2 top-2 text-violet-300 drop-shadow">
          <Gem className="h-3.5 w-3.5 fill-violet-500/70" />
        </span>
      )}
      <div className="flex h-full w-full items-center justify-center px-1">
        <CaptionTemplatePreview style={style} />
      </div>
      <span className="sr-only">{template.name}</span>
    </button>
  );
}
