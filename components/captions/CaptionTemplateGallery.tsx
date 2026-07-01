'use client';

import type { RenderTemplate } from '@/types';
import CaptionTemplateCard from './CaptionTemplateCard';

interface CaptionTemplateGalleryProps {
  templates: RenderTemplate[];
  selectedId: string | null;
  onSelect: (templateId: string | null) => void;
}

export default function CaptionTemplateGallery({ templates, selectedId, onSelect }: CaptionTemplateGalleryProps) {
  if (!templates.length) {
    return <p className="py-6 text-center text-xs text-secondary">No caption templates available.</p>;
  }

  return (
    <div className="grid max-h-[560px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {templates.map((template) => (
        <CaptionTemplateCard
          key={template.template_id}
          template={template}
          selected={selectedId === template.template_id}
          onClick={() => onSelect(template.template_id)}
        />
      ))}
    </div>
  );
}
