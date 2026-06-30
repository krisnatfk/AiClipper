'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import CaptionTemplatePicker from './CaptionTemplatePicker';
import TimeframeSlider from './TimeframeSlider';
import {
  configureSchema,
  CLIP_LENGTH_PRESETS,
  GENRE_OPTIONS,
  CLIP_MODEL_OPTIONS,
  LANGUAGE_OPTIONS,
  ASPECT_RATIOS,
  modelToProcessingMode,
  estimateProcessingCost,
} from '@/lib/configure/validation';
import type { Project, RenderTemplate } from '@/types';
import { AlertCircle, Loader2, Sparkles, Wand2, Scissors, Clock } from 'lucide-react';

interface ConfigurationFormProps {
  project: Project;
  templates: RenderTemplate[];
}

export default function ConfigurationForm({ project, templates }: ConfigurationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState(project.title || 'Untitled Project');
  const [language, setLanguage] = useState(project.language || 'auto');
  const [customLanguage, setCustomLanguage] = useState('');
  const [clippingMode, setClippingMode] = useState<'ai_clipping' | 'dont_clip'>(
    (project.clipping_mode as 'ai_clipping' | 'dont_clip') || 'ai_clipping'
  );
  const [clipModel, setClipModel] = useState(project.model || 'Auto');
  const [genre, setGenre] = useState(project.genre || 'Auto');
  const [clipLengthPreset, setClipLengthPreset] = useState('auto');
  const [clipCount, setClipCount] = useState(project.clip_count_requested || 5);
  const [clipMinSeconds, setClipMinSeconds] = useState(project.clip_min_seconds || 30);
  const [clipMaxSeconds, setClipMaxSeconds] = useState(project.clip_max_seconds || 90);
  const [autoHookEnabled, setAutoHookEnabled] = useState(project.auto_hook_enabled ?? true);
  const [specificMomentsPrompt, setSpecificMomentsPrompt] = useState(project.specific_moments_prompt || '');
  const [timeframeStartSec, setTimeframeStartSec] = useState<number>(project.timeframe_start_sec ?? 0);
  const [timeframeEndSec, setTimeframeEndSec] = useState<number>(
    project.timeframe_end_sec ?? project.duration_seconds ?? 0
  );
  const [captionTemplateId, setCaptionTemplateId] = useState<string | null>(
    project.caption_template_id ?? null
  );
  const [renderTemplateId, setRenderTemplateId] = useState<string | null>(
    project.render_template_id ?? null
  );
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>(
    (project.aspect_ratio as '9:16' | '1:1' | '16:9') || '9:16'
  );
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const onPresetChange = (presetId: string) => {
    setClipLengthPreset(presetId);
    const preset = CLIP_LENGTH_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.min !== null && preset.max !== null) {
      setClipMinSeconds(preset.min);
      setClipMaxSeconds(preset.max);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    const values = {
      title,
      language,
      customLanguage,
      clippingMode,
      clipModel,
      genre,
      clipLengthPreset,
      clipCount,
      clipMinSeconds,
      clipMaxSeconds,
      autoHookEnabled,
      specificMomentsPrompt,
      timeframeStartSec: timeframeEndSec > 0 ? timeframeStartSec : null,
      timeframeEndSec: timeframeEndSec > 0 ? timeframeEndSec : null,
      captionTemplateId,
      renderTemplateId,
      aspectRatio,
      saveAsDefault,
    };

    const parsed = configureSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Invalid configuration');
      setLoading(false);
      return;
    }

    if (language === 'custom' && !customLanguage.trim()) {
      setError('Please enter a custom language code');
      setLoading(false);
      return;
    }

    try {
      // Step 1: save settings.
      const settingsRes = await fetch(`/api/projects/${project.project_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          language: language === 'custom' ? customLanguage.trim() : language,
          clippingMode,
          clipModel,
          model: clipModel,
          processingMode: modelToProcessingMode(clipModel),
          genre,
          clipCount,
          clipMinSeconds,
          clipMaxSeconds,
          autoHookEnabled,
          specificMomentsPrompt,
          timeframeStartSec: parsed.data.timeframeStartSec,
          timeframeEndSec: parsed.data.timeframeEndSec,
          captionTemplateId,
          renderTemplateId,
          aspectRatio,
        }),
      });
      if (!settingsRes.ok) {
        const d = await settingsRes.json();
        throw new Error(d.error?.message || 'Failed to save settings');
      }

      // Step 2: persist as default (local preference, spec C.13).
      if (saveAsDefault) {
        localStorage.setItem(
          'autoclip:defaultConfig',
          JSON.stringify({ clippingMode, clipModel, genre, clipLengthPreset, autoHookEnabled, aspectRatio })
        );
      }

      // Step 3: start processing.
      const startRes = await fetch(`/api/projects/${project.project_id}/start`, {
        method: 'POST',
      });
      if (!startRes.ok) {
        const d = await startRes.json();
        throw new Error(d.error?.message || 'Failed to start processing');
      }

      router.push(`/projects/${project.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const isDontClip = clippingMode === 'dont_clip';

  return (
    <div className="space-y-6">
      {/* Mode tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setClippingMode('ai_clipping')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            clippingMode === 'ai_clipping' ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          AI Clipping
        </button>
        <button
          type="button"
          onClick={() => setClippingMode('dont_clip')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            clippingMode === 'dont_clip' ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Scissors className="w-4 h-4" />
          Don’t clip
        </button>
      </div>

      {/* Basic settings */}
      <section className="card p-4 space-y-4">
        <div>
          <label className="block text-xs text-secondary mb-1">Project Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input w-full"
            placeholder="Enter project title"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-secondary mb-1">Speech Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input w-full">
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {language === 'custom' && (
              <input
                type="text"
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                className="input w-full mt-2"
                placeholder="e.g. ja, es, fr"
              />
            )}
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">Aspect Ratio</label>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as '9:16' | '1:1' | '16:9')} className="input w-full">
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>{r === '9:16' ? '9:16 (Portrait)' : r === '1:1' ? '1:1 (Square)' : '16:9 (Landscape)'}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Estimated processing usage (spec C.3 — not "credits") */}
        <div className="flex items-center gap-2 text-xs text-secondary bg-canvas rounded-lg p-2.5">
          <Clock className="w-4 h-4 text-energy flex-shrink-0" />
          <span>
            Estimated processing cost: <span className="text-primary font-medium">
              {estimateProcessingCost(project.duration_seconds, clipModel, clippingMode)}
            </span>
          </span>
        </div>
      </section>

      {/* AI clipping settings (hidden for dont_clip) */}
      {!isDontClip && (
        <>
          <section className="card p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-secondary mb-1">Clip Model</label>
                <select value={clipModel} onChange={(e) => setClipModel(e.target.value)} className="input w-full">
                  {CLIP_MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">Genre</label>
                <select value={genre} onChange={(e) => setGenre(e.target.value)} className="input w-full">
                  {GENRE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-secondary mb-1">Clip Length</label>
              <select value={clipLengthPreset} onChange={(e) => onPresetChange(e.target.value)} className="input w-full">
                {CLIP_LENGTH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {clipLengthPreset === 'custom' && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1">Count</label>
                  <input type="number" min={1} max={20} value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className="input w-full text-center" />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1">Min (s)</label>
                  <input type="number" min={5} value={clipMinSeconds} onChange={(e) => setClipMinSeconds(Number(e.target.value))} className="input w-full text-center" />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1">Max (s)</label>
                  <input type="number" min={5} value={clipMaxSeconds} onChange={(e) => setClipMaxSeconds(Number(e.target.value))} className="input w-full text-center" />
                </div>
              </div>
            )}

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm text-primary">Auto Hook</span>
                <p className="text-xs text-secondary">Generate a text hook in the first 3–5s of each clip. Editable in the editor.</p>
              </div>
              <input type="checkbox" checked={autoHookEnabled} onChange={(e) => setAutoHookEnabled(e.target.checked)} className="accent-accent w-5 h-5" />
            </label>

            <div>
              <label className="block text-xs text-secondary mb-1">Include Specific Moments</label>
              <textarea
                value={specificMomentsPrompt}
                onChange={(e) => setSpecificMomentsPrompt(e.target.value)}
                rows={3}
                className="input w-full resize-none"
                placeholder="Example: Compile all the hilarious moments"
              />
            </div>
          </section>

          {/* Timeframe */}
          <section className="card p-4 space-y-3">
            <h3 className="text-sm font-medium text-primary">Processing Timeframe</h3>
            <TimeframeSlider
              durationSeconds={project.duration_seconds ?? null}
              start={timeframeStartSec}
              end={timeframeEndSec}
              onChange={(s, e) => {
                setTimeframeStartSec(s);
                setTimeframeEndSec(e);
              }}
            />
          </section>

          {/* Caption templates */}
          <section className="card p-4 space-y-3">
            <h3 className="text-sm font-medium text-primary">Caption Templates</h3>
            <CaptionTemplatePicker
              templates={templates}
              selectedId={captionTemplateId}
              onSelect={setCaptionTemplateId}
            />
            {captionTemplateId && (
              <input type="hidden" value={captionTemplateId} onChange={() => setRenderTemplateId(captionTemplateId)} />
            )}
          </section>
        </>
      )}

      {isDontClip && (
        <div className="card p-4 text-sm text-secondary">
          <p>
            <span className="text-primary font-medium">Don’t clip mode:</span> the video will be imported
            into the editor as a single full-length clip with a transcript. No automatic clipping or rendering —
            perfect for manual editing.
          </p>
        </div>
      )}

      {/* Save as default */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} className="accent-accent w-4 h-4" />
        <span className="text-sm text-secondary">Save these settings as default for future projects</span>
      </label>

      {error && (
        <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert flex items-start gap-2" role="alert">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="button" variant="primary" size="lg" loading={loading} onClick={handleSubmit} className="w-full h-12 text-base font-semibold">
        {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
        {loading ? 'Starting…' : 'Get clips in 1 click'}
      </Button>
    </div>
  );
}
