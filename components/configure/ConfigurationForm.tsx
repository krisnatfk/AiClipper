'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import CaptionTemplatePicker from './CaptionTemplatePicker';
import ProcessingTimeframeSlider from '@/components/project/ProcessingTimeframeSlider';
import {
  configureSchema,
  CLIP_LENGTH_PRESETS,
  GENRE_OPTIONS,
  CLIP_MODEL_OPTIONS,
  CLIP_MODEL_DESCRIPTIONS,
  LANGUAGE_OPTIONS,
  ASPECT_RATIOS,
  modelToProcessingMode,
  estimateProcessingCost,
} from '@/lib/configure/validation';
import type { Project, RenderTemplate } from '@/types';
import {
  AlertCircle,
  Captions,
  Check,
  Clock,
  FileText,
  Info,
  Loader2,
  Save,
  Scissors,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';

interface ConfigurationFormProps {
  project: Project;
  templates: RenderTemplate[];
}

const DEFAULT_STORAGE_KEY = 'autoclip:defaultConfig';

export default function ConfigurationForm({ project, templates }: ConfigurationFormProps) {
  const router = useRouter();
  const defaultTemplate = templates.find((template) => template.template_id === 'big-white')?.template_id
    || templates.find((template) => template.template_id === 'default')?.template_id
    || templates.find((template) => template.is_default)?.template_id
    || 'big-white';
  const initialDefaults = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem(DEFAULT_STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [srtStatus, setSrtStatus] = useState('');

  const [title, setTitle] = useState(project.title || 'Untitled Project');
  const [language, setLanguage] = useState(initialDefaults?.language || project.language || 'id');
  const [customLanguage, setCustomLanguage] = useState('');
  const [clippingMode, setClippingMode] = useState<'ai_clipping' | 'dont_clip'>(
    initialDefaults?.clippingMode || (project.clipping_mode as 'ai_clipping' | 'dont_clip') || 'ai_clipping'
  );
  const [clipModel, setClipModel] = useState(initialDefaults?.clipModel || project.model || 'Auto');
  const [genre, setGenre] = useState(initialDefaults?.genre || project.genre || 'Auto');
  const [clipLengthPreset, setClipLengthPreset] = useState(initialDefaults?.clipLengthPreset || 'auto');
  const [clipCount, setClipCount] = useState(project.clip_count_requested || 5);
  const [clipMinSeconds, setClipMinSeconds] = useState(project.clip_min_seconds || 30);
  const [clipMaxSeconds, setClipMaxSeconds] = useState(project.clip_max_seconds || 90);
  const [autoHookEnabled, setAutoHookEnabled] = useState(initialDefaults?.autoHookEnabled ?? project.auto_hook_enabled ?? true);
  const [specificMomentsPrompt, setSpecificMomentsPrompt] = useState(project.specific_moments_prompt || '');
  const [timeframeStartSec, setTimeframeStartSec] = useState<number>(project.timeframe_start_sec ?? 0);
  const [timeframeEndSec, setTimeframeEndSec] = useState<number>(
    project.timeframe_end_sec ?? project.duration_seconds ?? 0
  );
  const [durationSeconds, setDurationSeconds] = useState<number | null>(project.duration_seconds ?? null);
  const [captionTemplateId, setCaptionTemplateId] = useState<string | null>(
    (initialDefaults?.captionTemplateId === 'no-caption' ? null : initialDefaults?.captionTemplateId)
      || project.caption_template_id
      || defaultTemplate
  );
  const [renderTemplateId, setRenderTemplateId] = useState<string | null>(
    project.render_template_id ?? null
  );
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9' | '4:5'>(
    initialDefaults?.aspectRatio || (project.aspect_ratio as '9:16' | '1:1' | '16:9' | '4:5') || '9:16'
  );
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [srtFile, setSrtFile] = useState<File | null>(null);

  useEffect(() => {
    if (!renderTemplateId && captionTemplateId) setRenderTemplateId(captionTemplateId);
  }, [captionTemplateId, renderTemplateId]);

  useEffect(() => {
    if (durationSeconds && timeframeEndSec <= 0) {
      setTimeframeStartSec(project.timeframe_start_sec ?? 0);
      setTimeframeEndSec(project.timeframe_end_sec ?? durationSeconds);
    }
  }, [durationSeconds, project.timeframe_end_sec, project.timeframe_start_sec, timeframeEndSec]);

  useEffect(() => {
    if (durationSeconds) return;
    let canceled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${project.project_id}`, { cache: 'no-store' });
        const payload = await res.json();
        const nextProject = payload.data;
        if (canceled || !nextProject) return;
        if (nextProject.status === 'FAILED') {
          setError(nextProject.error_message || 'Project metadata probing failed.');
          return;
        }
        if (nextProject.duration_seconds) {
          const duration = Number(nextProject.duration_seconds);
          setDurationSeconds(duration);
          setTimeframeStartSec(Number(nextProject.timeframe_start_sec ?? 0));
          setTimeframeEndSec(Number(nextProject.timeframe_end_sec ?? duration));
        }
      } catch {
        // Keep polling quietly; the submit button will surface hard failures.
      }
    };
    poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      canceled = true;
      window.clearInterval(id);
    };
  }, [durationSeconds, project.project_id]);

  const isDontClip = clippingMode === 'dont_clip';
  const selectedMinutes = timeframeEndSec > 0
    ? Math.round(Math.max(1, timeframeEndSec - Math.max(0, timeframeStartSec)) / 60)
    : Math.round((durationSeconds || 0) / 60);

  const onPresetChange = (presetId: string) => {
    setClipLengthPreset(presetId);
    const preset = CLIP_LENGTH_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.min !== null && preset.max !== null) {
      setClipMinSeconds(preset.min);
      setClipMaxSeconds(preset.max);
    }
  };

  const uploadSrtIfNeeded = async () => {
    if (!srtFile) return;
    const formData = new FormData();
    formData.append('file', srtFile);
    const res = await fetch(`/api/projects/${project.project_id}/transcript`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Invalid SRT file');
    setSrtStatus(`Uploaded SRT: ${data.meta?.segments || 0} segments`);
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
      renderTemplateId: renderTemplateId || captionTemplateId,
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
      await uploadSrtIfNeeded();

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
          renderTemplateId: renderTemplateId || captionTemplateId,
          enableCaption: captionTemplateId !== 'no-caption',
          caption_settings: {
            uppercase: true,
            maxWordsPerCaption: 2,
            position: 'bottom-center',
            fontSize: 64,
            fontWeight: 900,
            textColor: '#FFFFFF',
            strokeColor: '#000000',
            strokeWidth: 8,
            shadow: true,
            animation: 'pop',
          },
          aspectRatio,
          maxWordsPerSegment: 2,
          max_words_per_caption: 2,
          captionUppercase: true,
          uppercase: true,
          useUploadedSrt: Boolean(srtFile),
        }),
      });
      if (!settingsRes.ok) {
        const d = await settingsRes.json();
        throw new Error(d.error?.message || 'Failed to save settings');
      }

      if (saveAsDefault) {
        localStorage.setItem(
          DEFAULT_STORAGE_KEY,
          JSON.stringify({
            language,
            clippingMode,
            clipModel,
            genre,
            clipLengthPreset,
            autoHookEnabled,
            captionTemplateId,
            aspectRatio,
          })
        );
      }

      const startRes = await fetch(`/api/projects/${project.project_id}/start`, { method: 'POST' });
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

  return (
    <div className="space-y-4">
      <section className="card bg-card/80 p-4">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <Field label="Project title" className="xl:flex-1">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input h-10" />
          </Field>
          <Field label="Speech language" className="xl:w-48">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input h-10">
              {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          {language === 'custom' && (
            <Field label="Language code" className="xl:w-36">
              <input value={customLanguage} onChange={(e) => setCustomLanguage(e.target.value)} className="input h-10" placeholder="e.g. fr" />
            </Field>
          )}
          <label className="xl:w-44 h-10 px-3 rounded-lg border border-border bg-sidebar/70 text-sm text-secondary hover:text-primary cursor-pointer flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" />
            <span className="truncate">{srtFile ? srtFile.name : 'Upload SRT'}</span>
            <input
              type="file"
              accept=".srt"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setSrtStatus('');
                if (file && !file.name.toLowerCase().endsWith('.srt')) {
                  setError('Please upload a valid .srt file.');
                  return;
                }
                setSrtFile(file);
              }}
            />
          </label>
          <Button type="button" variant="primary" size="lg" loading={loading} onClick={handleSubmit} className="xl:w-56 h-11 text-sm font-semibold bg-white text-black hover:bg-white/90">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {loading ? 'Starting...' : 'Get clips in 1 click'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-secondary">
          <span className="inline-flex items-center gap-1 rounded-md bg-sidebar/70 px-2.5 py-1">
            <Clock className="w-3.5 h-3.5 text-energy" />
            {estimateProcessingCost(durationSeconds, clipModel, clippingMode, timeframeStartSec, timeframeEndSec)}
          </span>
          {selectedMinutes >= 60 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-energy/10 px-2.5 py-1 text-energy">
              <Info className="w-3.5 h-3.5" />
              Long videos may take longer. Use timeframe to process only important parts.
            </span>
          )}
          {srtStatus && <span className="inline-flex items-center gap-1 text-success"><Check className="w-3.5 h-3.5" />{srtStatus}</span>}
        </div>
      </section>

      <section className="card bg-card/80 p-4 space-y-4">
        <div className="flex gap-2 border-b border-border">
          <TabButton active={!isDontClip} onClick={() => setClippingMode('ai_clipping')} icon={<Wand2 className="w-4 h-4" />}>AI clipping</TabButton>
          <TabButton active={isDontClip} onClick={() => setClippingMode('dont_clip')} icon={<Scissors className="w-4 h-4" />}>Do not clip</TabButton>
        </div>

        {!isDontClip ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Clip model">
                <select value={clipModel} onChange={(e) => setClipModel(e.target.value)} className="input h-10">
                  {CLIP_MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-secondary">{CLIP_MODEL_DESCRIPTIONS[clipModel]}</p>
              </Field>
              <Field label="Genre">
                <select value={genre} onChange={(e) => setGenre(e.target.value)} className="input h-10">
                  {GENRE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Clip length">
                <select value={clipLengthPreset} onChange={(e) => onPresetChange(e.target.value)} className="input h-10">
                  {CLIP_LENGTH_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3">
              <div className="rounded-lg border border-border bg-sidebar/50 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-primary font-medium">Auto hook</div>
                  <div className="text-xs text-secondary">Bold uppercase hook in the first seconds.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoHookEnabled((value: boolean) => !value)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors ${autoHookEnabled ? 'bg-accent' : 'bg-border'}`}
                  aria-pressed={autoHookEnabled}
                >
                  <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${autoHookEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <Field label="Include specific moments">
                <textarea
                  value={specificMomentsPrompt}
                  onChange={(e) => setSpecificMomentsPrompt(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder="Example: find all the moments when someone scored"
                />
              </Field>
            </div>

            {clipLengthPreset === 'custom' && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Count"><input type="number" min={1} max={20} value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className="input h-10 text-center" /></Field>
                <Field label="Min seconds"><input type="number" min={5} value={clipMinSeconds} onChange={(e) => setClipMinSeconds(Number(e.target.value))} className="input h-10 text-center" /></Field>
                <Field label="Max seconds"><input type="number" min={5} value={clipMaxSeconds} onChange={(e) => setClipMaxSeconds(Number(e.target.value))} className="input h-10 text-center" /></Field>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-sidebar/50 p-3 text-sm text-secondary">
            <span className="text-primary font-medium">Do not clip mode:</span> AutoClip will create one editor-ready clip from the selected timeframe. Transcription and captions can still be generated.
          </div>
        )}

        <ProcessingTimeframeSlider
          durationSeconds={durationSeconds}
          startSec={timeframeStartSec}
          endSec={timeframeEndSec}
          onChange={(s, e) => {
            setTimeframeStartSec(s);
            setTimeframeEndSec(e);
          }}
        />
      </section>

      <section className="card bg-card/80 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Captions className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-primary">Caption templates</h2>
          </div>
          <Field label="Aspect ratio" className="w-36">
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as '9:16' | '1:1' | '16:9' | '4:5')} className="input h-9 py-1.5">
              {ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </Field>
        </div>

        <CaptionTemplatePicker templates={templates} selectedId={captionTemplateId} onSelect={setCaptionTemplateId} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-secondary">
            <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} className="accent-accent w-4 h-4" />
            Save settings above as default
          </label>
          <button
            type="button"
            onClick={() => setSaveAsDefault(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-sidebar/70 px-3 py-2 text-sm text-primary hover:bg-hover"
          >
            <Save className="w-4 h-4" />
            Save settings as default
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert flex items-start gap-2" role="alert">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {srtFile && (
        <div className="rounded-lg border border-border bg-sidebar/60 px-3 py-2 text-xs text-secondary flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          Uploaded SRT will be validated and used instead of Whisper transcription.
        </div>
      )}
    </div>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-secondary">{label}</span>
      {children}
    </label>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
