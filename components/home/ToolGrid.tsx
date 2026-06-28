'use client';

import {
  Scissors,
  Type,
  Film,
  Mic,
  Volume2,
  Maximize,
  Image,
  Zap,
  ArrowUpCircle,
  FileText
} from 'lucide-react';

const tools = [
  { name: 'Long to shorts', icon: Scissors, available: true },
  { name: 'AI Captions', icon: Type, available: true },
  { name: 'Video editor', icon: Film, available: false },
  { name: 'Enhance speech', icon: Mic, available: false },
  { name: 'AI Sound Effect', icon: Volume2, available: false },
  { name: 'AI Reframe', icon: Maximize, available: false },
  { name: 'AI B-Roll', icon: Image, available: false },
  { name: 'AI Hook', icon: Zap, available: false },
  { name: 'Upscale', icon: ArrowUpCircle, available: false },
  { name: 'Script to video', icon: FileText, available: false },
];

export default function ToolGrid() {
  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-1">
          AI-Powered Tools
        </h3>
        <p className="text-sm text-secondary">
          Transform your content with professional AI tools
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-5 gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;

          return (
            <button
              key={tool.name}
              className="card-hover p-4 flex flex-col items-center gap-2 text-center group relative"
              disabled={!tool.available}
            >
              {/* Icon */}
              <div className={`
                w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-200
                ${tool.available
                  ? 'bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white'
                  : 'bg-secondary/10 text-secondary/50'
                }
              `}>
                <Icon className="w-6 h-6" />
              </div>

              {/* Label */}
              <span className={`
                text-xs font-medium transition-colors
                ${tool.available
                  ? 'text-secondary group-hover:text-primary'
                  : 'text-secondary/50'
                }
              `}>
                {tool.name}
              </span>

              {/* Coming Soon Badge */}
              {!tool.available && (
                <div className="absolute top-2 right-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-energy/10 text-energy">
                    Soon
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
