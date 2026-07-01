import { z } from 'zod';

export const CLIP_LENGTH_PRESETS = [
  { id: 'auto', label: 'Auto (30s-90s)', min: 30, max: 90 },
  { id: 'under-30', label: '<30s', min: 5, max: 29 },
  { id: '30-59', label: '30s-59s', min: 30, max: 59 },
  { id: '60-89', label: '60s-89s', min: 60, max: 89 },
  { id: '90-180', label: '90s-3m', min: 90, max: 180 },
  { id: '180-300', label: '3m-5m', min: 180, max: 300 },
  { id: '300-600', label: '5m-10m', min: 300, max: 600 },
  { id: 'custom', label: 'Custom', min: null, max: null },
] as const;

export const GENRE_OPTIONS = [
  'Auto',
  'Q&A',
  'Commentary',
  'Marketing',
  'Webinar',
  'Motivational speech',
  'Podcast',
  'News',
  'Education',
  'Tutorial',
  'Product review',
  'Gaming',
  'Vlog',
  'Comedy',
  'Sports',
  'Religious talk',
  'Other',
] as const;

export const CLIP_MODEL_OPTIONS = [
  'Auto',
  'ClipAnything',
  'ClipBasic',
  'Podcast Mode',
  'News Mode',
  'Gaming Mode',
  'Custom Prompt Mode',
] as const;

export const CLIP_MODEL_DESCRIPTIONS: Record<string, string> = {
  Auto: 'Let AI choose the optimal model.',
  ClipAnything: 'Smartest model. Great for any videos.',
  ClipBasic: 'Great for clipping talking videos.',
  'Podcast Mode': 'Best for interview or long conversation.',
  'News Mode': 'Best for news/commentary videos.',
  'Gaming Mode': 'Best for gameplay and reaction content.',
  'Custom Prompt Mode': "Follow user's specific moment prompt.",
};

export const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'id', label: 'Indonesian' },
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Malay' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'custom', label: 'Custom' },
] as const;

export const ASPECT_RATIOS = ['9:16', '1:1', '16:9', '4:5'] as const;

export const configureSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120),
  language: z.string().min(1),
  customLanguage: z.string().optional(),
  clippingMode: z.enum(['ai_clipping', 'dont_clip']),
  clipModel: z.string(),
  genre: z.string(),
  clipLengthPreset: z.string(),
  clipCount: z.number().int().min(1).max(20),
  clipMinSeconds: z.number().int().min(5).max(600),
  clipMaxSeconds: z.number().int().min(5).max(1800),
  autoHookEnabled: z.boolean(),
  specificMomentsPrompt: z.string().max(2000).optional().default(''),
  timeframeStartSec: z.number().int().min(0).nullable(),
  timeframeEndSec: z.number().int().min(1).nullable(),
  captionTemplateId: z.string().nullable(),
  renderTemplateId: z.string().nullable(),
  aspectRatio: z.enum(['9:16', '1:1', '16:9', '4:5']),
  saveAsDefault: z.boolean().default(false),
});

export type ConfigureFormValues = z.infer<typeof configureSchema>;

export function modelToProcessingMode(clipModel: string): 'fast' | 'balanced' | 'quality' {
  if (clipModel === 'ClipBasic') return 'fast';
  if (clipModel === 'ClipAnything') return 'quality';
  return 'balanced';
}

export function estimateProcessingCost(
  durationSeconds: number | null | undefined,
  clipModel: string,
  clippingMode: string,
  timeframeStartSec?: number | null,
  timeframeEndSec?: number | null
): string {
  if (clippingMode === 'dont_clip') return 'Low (import only)';
  const selectedDuration = timeframeEndSec && timeframeEndSec > 0
    ? Math.max(1, timeframeEndSec - Math.max(0, timeframeStartSec || 0))
    : durationSeconds;
  if (!selectedDuration) return 'Calculating...';
  const minutes = Math.max(1, Math.round(selectedDuration / 60));
  const multiplier = clipModel === 'ClipBasic' ? 1 : clipModel === 'Auto' ? 1.2 : 1.5;
  const units = Math.round(minutes * multiplier);
  return `${units} processing units (~${minutes} min selected)`;
}
