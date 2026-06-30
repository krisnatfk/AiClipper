'use client';

import { useEditorStore, CaptionStyle, HookStyle, LayoutConfig } from '@/store/editorStore';

interface Template {
  id: string;
  name: string;
  description: string;
  captionStyle: Partial<CaptionStyle>;
  hookStyle: Partial<HookStyle>;
  layoutConfig: Partial<LayoutConfig>;
}

const templates: Template[] = [
  {
    id: 'bold-yellow',
    name: 'Bold Yellow Viral',
    description: 'High-contrast yellow text with thick black stroke, perfect for TikTok and Reels.',
    captionStyle: {
      fontFamily: 'Inter',
      fontSize: 64,
      fontWeight: 900,
      textColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 10,
      highlightColor: '#FACC15',
      uppercase: true,
      position: 'middle',
    },
    hookStyle: {
      position: 'top',
      backgroundColor: '#000000AA',
      textColor: '#FACC15',
    },
    layoutConfig: {
      mode: 'full',
      aspectRatio: '9:16',
    }
  },
  {
    id: 'clean-white',
    name: 'Clean White Podcast',
    description: 'Minimalist white text without stroke, subtle shadow.',
    captionStyle: {
      fontFamily: 'Roboto',
      fontSize: 52,
      fontWeight: 500,
      textColor: '#FFFFFF',
      strokeWidth: 0,
      shadow: true,
      shadowColor: '#000000AA',
      highlightColor: '#60A5FA', // Blue
      uppercase: false,
      position: 'bottom',
    },
    hookStyle: {
      position: 'top',
      backgroundColor: '#00000000',
      textColor: '#FFFFFF',
    },
    layoutConfig: {
      mode: 'fit',
      aspectRatio: '9:16',
    }
  },
  {
    id: 'news-split',
    name: 'News Split Screen',
    description: 'Split top-bottom layout with formal fonts.',
    captionStyle: {
      fontFamily: 'Montserrat',
      fontSize: 48,
      fontWeight: 700,
      textColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 4,
      highlightColor: '#EF4444', // Red
      uppercase: true,
      position: 'middle',
    },
    hookStyle: {
      position: 'top',
      backgroundColor: '#EF4444FF',
      textColor: '#FFFFFF',
    },
    layoutConfig: {
      mode: 'split-top-bottom',
      aspectRatio: '9:16',
    }
  },
  {
    id: 'gaming-top-bottom',
    name: 'Gaming Top Bottom',
    description: 'Facecam on top, gameplay on bottom.',
    captionStyle: {
      fontFamily: 'Outfit',
      fontSize: 58,
      fontWeight: 800,
      textColor: '#FFFFFF',
      strokeColor: '#000000',
      strokeWidth: 8,
      highlightColor: '#A855F7', // Purple
      uppercase: true,
      position: 'middle',
    },
    hookStyle: {
      position: 'top',
      backgroundColor: '#A855F7AA',
      textColor: '#FFFFFF',
    },
    layoutConfig: {
      mode: 'split-top-bottom',
      aspectRatio: '9:16',
    }
  },
  {
    id: 'minimal-subtitle',
    name: 'Minimal Subtitle',
    description: 'Small, unobtrusive captions at the bottom.',
    captionStyle: {
      fontFamily: 'Inter',
      fontSize: 36,
      fontWeight: 400,
      textColor: '#DDDDDD',
      strokeWidth: 0,
      shadow: true,
      shadowColor: '#000000',
      highlightColor: '#FFFFFF',
      uppercase: false,
      position: 'bottom',
    },
    hookStyle: {
      position: 'top',
      backgroundColor: '#00000000',
      textColor: '#DDDDDD',
    },
    layoutConfig: {
      mode: 'full',
      aspectRatio: '16:9',
    }
  },
];

export default function TemplatePanel() {
  const { setCaptionStyle, setHookStyle, setLayoutConfig } = useEditorStore();

  const applyTemplate = (template: Template) => {
    setCaptionStyle(template.captionStyle);
    setHookStyle(template.hookStyle);
    setLayoutConfig(template.layoutConfig);
  };

  return (
    <div className="space-y-4">
      {templates.map(template => (
        <button
          key={template.id}
          onClick={() => applyTemplate(template)}
          className="w-full text-left p-4 border border-border rounded bg-canvas hover:bg-canvas/80 transition-colors flex flex-col gap-2"
        >
          <div className="font-semibold text-primary">{template.name}</div>
          <div className="text-xs text-secondary">{template.description}</div>
        </button>
      ))}
    </div>
  );
}
