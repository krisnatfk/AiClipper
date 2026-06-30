'use client';

import { useEditorStore, TabType } from '@/store/editorStore';
import {
  LayoutTemplate,
  Image,
  ArrowLeftRight,
  Type,
  Music,
  Zap,
  Captions,
  Crop,
  Download,
  ScrollText,
} from 'lucide-react';

interface ToolButton {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder?: boolean;
}

const TOOLS: ToolButton[] = [
  { id: 'templates', label: 'Brand template', icon: LayoutTemplate },
  { id: 'b-roll', label: 'B-Roll', icon: Image, placeholder: true },
  { id: 'transitions', label: 'Transitions', icon: ArrowLeftRight, placeholder: true },
  { id: 'text', label: 'Text', icon: Type, placeholder: true },
  { id: 'audio', label: 'Audio', icon: Music, placeholder: true },
  { id: 'hook', label: 'AI Hook', icon: Zap },
  { id: 'captions', label: 'Captions', icon: Captions },
  { id: 'tracking', label: 'Tracking', icon: Crop },
  { id: 'export', label: 'Export settings', icon: Download },
  { id: 'transcript', label: 'Transcript', icon: ScrollText },
];

/**
 * Vertical right toolbar (spec Section F right toolbar). 9 tool icons; clicking
 * one switches the left panel's active tab. Placeholder tools (B-Roll,
 * Transitions, Text, Audio) are shown disabled with a "coming soon" tooltip.
 */
export default function EditorRightToolbar() {
  const { activeTab, setActiveTab } = useEditorStore();

  return (
    <div className="w-14 border-l border-border bg-sidebar flex flex-col items-center py-3 gap-1 shrink-0">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTab === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => !tool.placeholder && setActiveTab(tool.id)}
            disabled={tool.placeholder}
            title={tool.placeholder ? `${tool.label} (coming soon)` : tool.label}
            className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive
                ? 'bg-accent text-white'
                : tool.placeholder
                  ? 'text-secondary/30 cursor-not-allowed'
                  : 'text-secondary hover:text-primary hover:bg-canvas'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[8px] leading-none">{tool.label.split(' ')[0]}</span>
          </button>
        );
      })}
    </div>
  );
}
