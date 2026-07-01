'use client';

import { useMemo, useState } from 'react';
import type React from 'react';
import { ChevronDown } from 'lucide-react';
import type { RenderTemplate } from '@/types';
import { cn } from '@/lib/utils';
import CaptionTemplateGallery from '@/components/captions/CaptionTemplateGallery';

interface CaptionTemplatePickerProps {
  templates: RenderTemplate[];
  selectedId: string | null;
  onSelect: (templateId: string | null) => void;
}

export default function CaptionTemplatePicker({
  templates,
  selectedId,
  onSelect,
}: CaptionTemplatePickerProps) {
  const [tab, setTab] = useState<'presets' | 'mine'>('presets');
  const [collapsed, setCollapsed] = useState(false);

  const presets = useMemo(() => templates.filter((t) => t.is_builtin), [templates]);
  const mine = useMemo(() => {
    const userTemplates = templates.filter((t) => !t.is_builtin);
    if (userTemplates.length > 0) return userTemplates;
    return presets.slice(0, 2).map((template, index) => ({
      ...template,
      id: -2000 - index,
      name: index === 0 ? 'My Default' : 'My Creator Bold',
      is_builtin: false,
      is_default: false,
    }));
  }, [templates, presets]);
  const list = tab === 'presets' ? presets : mine;

  return (
    <div className="rounded-xl border border-border bg-[#202020]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-primary">Templates</h3>
          <div className="hidden gap-2 sm:flex">
            <Tab active={tab === 'presets'} onClick={() => setTab('presets')}>
              Quick presets
            </Tab>
            <Tab active={tab === 'mine'} onClick={() => setTab('mine')}>
              My templates
            </Tab>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-full p-1 text-secondary hover:bg-white/10 hover:text-primary"
          aria-label={collapsed ? 'Expand templates' : 'Collapse templates'}
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </div>

      <div className="flex gap-2 border-b border-border px-4 py-2 sm:hidden">
        <Tab active={tab === 'presets'} onClick={() => setTab('presets')}>Quick presets</Tab>
        <Tab active={tab === 'mine'} onClick={() => setTab('mine')}>My templates</Tab>
      </div>

      {!collapsed && (
        <div className="p-4">
          <CaptionTemplateGallery templates={list} selectedId={selectedId} onSelect={onSelect} />
          {selectedId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="mt-3 text-xs text-secondary hover:text-alert transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-white text-black' : 'bg-[#2A2A2A] text-secondary hover:text-primary'
      )}
    >
      {children}
    </button>
  );
}
