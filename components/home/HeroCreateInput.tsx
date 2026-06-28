'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import {
  Link as LinkIcon,
  Settings2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Zap,
} from 'lucide-react';

type RangeOption = 'full' | 'first5min' | 'custom';

interface FormConfig {
  title: string;
  sourceLang: string;
  model: 'ClipBasic' | 'ClipAnything';
  genre: string;
  clipDurationMin: number;
  clipDurationMax: number;
  rangeOption: RangeOption;
  rangeStartSec: number;
  rangeEndSec: number;
  customPrompt: string;
  enableCaption: boolean;
  enableRemoveFillerWords: boolean;
  enableHighlight: boolean;
  enableEmoji: boolean;
  enableUppercase: boolean;
  layoutAspectRatio: 'portrait' | 'square' | 'landscape';
  brandTemplateId: string;
}

const DEFAULT_CONFIG: FormConfig = {
  title: '',
  sourceLang: 'id',
  model: 'ClipAnything',
  genre: 'Auto',
  clipDurationMin: 30,
  clipDurationMax: 90,
  rangeOption: 'first5min',
  rangeStartSec: 0,
  rangeEndSec: 300,
  customPrompt:
    'Find the most interesting, emotional, controversial, funny, or informative moments from this video and turn them into short viral clips.',
  enableCaption: true,
  enableRemoveFillerWords: false,
  enableHighlight: true,
  enableEmoji: true,
  enableUppercase: true,
  layoutAspectRatio: 'portrait',
  brandTemplateId: '',
};

interface BrandTemplate {
  brand_template_id: string;
  name: string;
}

export default function HeroCreateInput() {
  const router = useRouter();
  const [step, setStep] = useState<'url' | 'config'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [config, setConfig] = useState<FormConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [brandTemplates, setBrandTemplates] = useState<BrandTemplate[]>([]);

  useEffect(() => {
    fetch('/api/brand-templates')
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setBrandTemplates(data.data);
      })
      .catch(() => {});
  }, []);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!videoUrl.trim()) {
      setError('Please enter a video URL');
      return;
    }

    try {
      new URL(videoUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    // Auto-fill title from URL
    try {
      const url = new URL(videoUrl);
      if (!config.title) {
        setConfig((c) => ({ ...c, title: `Clip from ${url.hostname}` }));
      }
    } catch { /* ignore */ }

    setStep('config');
  };

  const handleCreateProject = async () => {
    setError('');
    setLoading(true);

    // Build range based on option
    let rangeStartSec: number | undefined;
    let rangeEndSec: number | undefined;

    if (config.rangeOption === 'first5min') {
      rangeStartSec = 0;
      rangeEndSec = 300;
    } else if (config.rangeOption === 'custom') {
      rangeStartSec = config.rangeStartSec;
      rangeEndSec = config.rangeEndSec;
    }

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          title: config.title || 'Untitled Project',
          sourceLang: config.sourceLang,
          model: config.model,
          genre: config.genre,
          clipDurationMin: config.clipDurationMin,
          clipDurationMax: config.clipDurationMax,
          rangeStartSec,
          rangeEndSec,
          customPrompt:
            config.model === 'ClipAnything' ? config.customPrompt : undefined,
          layoutAspectRatio: config.layoutAspectRatio,
          enableCaption: config.enableCaption,
          enableRemoveFillerWords: config.enableRemoveFillerWords,
          enableHighlight: config.enableHighlight,
          enableEmoji: config.enableEmoji,
          enableUppercase: config.enableUppercase,
          brandTemplateId: config.brandTemplateId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to create project');
      }

      const data = await response.json();
      router.push(`/projects/${data.data.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const updateConfig = <K extends keyof FormConfig>(key: K, val: FormConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: val }));

  // ── Step 1: URL Input ──
  if (step === 'url') {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <form onSubmit={handleUrlSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary pointer-events-none">
              <LinkIcon className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste YouTube, TikTok, or video URL here..."
              className="w-full bg-card border-2 border-border rounded-xl pl-12 pr-4 py-4 text-base text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
              aria-label="Video URL"
            />
          </div>

          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert" role="alert">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full h-12 text-base font-semibold">
            <Settings2 className="w-5 h-5 mr-2" />
            Configure &amp; Create
          </Button>

          <p className="text-center text-sm text-secondary">
            Supports YouTube, TikTok, Instagram, Twitter, and direct video links
          </p>
        </form>
      </div>
    );
  }

  // ── Step 2: Configuration Panel ──
  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => { setStep('url'); setError(''); }} className="text-secondary hover:text-primary transition-colors" aria-label="Go back to URL input">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-secondary">Video URL</p>
          <p className="text-primary text-sm truncate">{videoUrl}</p>
        </div>
      </div>

      {/* Basic Settings */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-medium text-primary flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          Project Settings
        </h3>

        {/* Title */}
        <div>
          <label htmlFor="project-title" className="block text-xs text-secondary mb-1">Project Title</label>
          <input id="project-title" type="text" value={config.title} onChange={(e) => updateConfig('title', e.target.value)} placeholder="Enter project title" className="input w-full" />
        </div>

        {/* Model + Language Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="model-select" className="block text-xs text-secondary mb-1">AI Model</label>
            <select id="model-select" value={config.model} onChange={(e) => updateConfig('model', e.target.value as 'ClipBasic' | 'ClipAnything')} className="input w-full">
              <option value="ClipAnything">ClipAnything (Recommended)</option>
              <option value="ClipBasic">ClipBasic</option>
            </select>
          </div>
          <div>
            <label htmlFor="lang-select" className="block text-xs text-secondary mb-1">Speech Language</label>
            <select id="lang-select" value={config.sourceLang} onChange={(e) => updateConfig('sourceLang', e.target.value)} className="input w-full">
              <option value="id">Indonesian</option>
              <option value="en">English</option>
              <option value="auto">Auto Detect</option>
            </select>
          </div>
        </div>

        {/* Duration + Range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-secondary mb-1">Clip Duration (sec)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={config.clipDurationMin} onChange={(e) => updateConfig('clipDurationMin', Number(e.target.value))} min={15} max={300} className="input w-full text-center" aria-label="Min duration" />
              <span className="text-secondary text-xs">-</span>
              <input type="number" value={config.clipDurationMax} onChange={(e) => updateConfig('clipDurationMax', Number(e.target.value))} min={15} max={300} className="input w-full text-center" aria-label="Max duration" />
            </div>
          </div>
          <div>
            <label htmlFor="range-select" className="block text-xs text-secondary mb-1">Video Range</label>
            <select id="range-select" value={config.rangeOption} onChange={(e) => updateConfig('rangeOption', e.target.value as RangeOption)} className="input w-full">
              <option value="full">Full Video</option>
              <option value="first5min">First 5 Minutes (Recommended)</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
        </div>

        {/* Custom Range */}
        {config.rangeOption === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="range-start" className="block text-xs text-secondary mb-1">Start (seconds)</label>
              <input id="range-start" type="number" value={config.rangeStartSec} onChange={(e) => updateConfig('rangeStartSec', Number(e.target.value))} min={0} className="input w-full" />
            </div>
            <div>
              <label htmlFor="range-end" className="block text-xs text-secondary mb-1">End (seconds)</label>
              <input id="range-end" type="number" value={config.rangeEndSec} onChange={(e) => updateConfig('rangeEndSec', Number(e.target.value))} min={1} className="input w-full" />
            </div>
          </div>
        )}

        {/* Custom Prompt for ClipAnything */}
        {config.model === 'ClipAnything' && (
          <div>
            <label htmlFor="custom-prompt" className="block text-xs text-secondary mb-1">Custom Prompt</label>
            <textarea id="custom-prompt" value={config.customPrompt} onChange={(e) => updateConfig('customPrompt', e.target.value)} rows={3} className="input w-full resize-none" placeholder="Describe what kind of clips to find..." />
          </div>
        )}
      </div>

      {/* Advanced Settings Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-full justify-center"
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </button>

      {/* Advanced Panel */}
      {showAdvanced && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          {/* Layout + Genre */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="layout-select" className="block text-xs text-secondary mb-1">Layout</label>
              <select id="layout-select" value={config.layoutAspectRatio} onChange={(e) => updateConfig('layoutAspectRatio', e.target.value as 'portrait' | 'square' | 'landscape')} className="input w-full">
                <option value="portrait">Portrait (9:16)</option>
                <option value="square">Square (1:1)</option>
                <option value="landscape">Landscape (16:9)</option>
              </select>
            </div>
            <div>
              <label htmlFor="genre-select" className="block text-xs text-secondary mb-1">Genre</label>
              <select id="genre-select" value={config.genre} onChange={(e) => updateConfig('genre', e.target.value)} className="input w-full">
                <option value="Auto">Auto</option>
                <option value="Educational">Educational</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Sports">Sports</option>
                <option value="Music">Music</option>
                <option value="News">News</option>
              </select>
            </div>
          </div>

          {/* Brand Template */}
          {brandTemplates.length > 0 && (
            <div>
              <label htmlFor="brand-template" className="block text-xs text-secondary mb-1">Brand Template</label>
              <select id="brand-template" value={config.brandTemplateId} onChange={(e) => updateConfig('brandTemplateId', e.target.value)} className="input w-full">
                <option value="">None</option>
                {brandTemplates.map((t) => (
                  <option key={t.brand_template_id} value={t.brand_template_id}>
                    {t.name || t.brand_template_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ['enableCaption', 'Captions'] as const,
              ['enableHighlight', 'Highlight Keywords'] as const,
              ['enableEmoji', 'Emoji'] as const,
              ['enableUppercase', 'Uppercase'] as const,
              ['enableRemoveFillerWords', 'Remove Filler Words'] as const,
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={config[key]} onChange={(e) => updateConfig(key, e.target.checked)} className="accent-accent w-4 h-4" />
                <span className="text-sm text-primary">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert" role="alert">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="button"
        variant="primary"
        size="lg"
        loading={loading}
        onClick={handleCreateProject}
        className="w-full h-12 text-base font-semibold"
      >
        {loading ? 'Creating Project...' : 'Create Clip Project'}
      </Button>
    </div>
  );
}
