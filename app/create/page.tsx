import AppShell from '@/components/layout/AppShell';
import HeroCreateInput from '@/components/home/HeroCreateInput';
import { Sparkles } from 'lucide-react';

export default function CreatePage() {
  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Self-Processing Engine
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-3">
              Generate Clips with AutoClip AI
            </h1>
            <p className="text-base text-secondary max-w-2xl mx-auto">
              Upload a local video and queue it for FFmpeg, transcription, AI highlight detection, and local rendering.
            </p>
          </div>

          <HeroCreateInput />
        </div>
      </div>
    </AppShell>
  );
}

