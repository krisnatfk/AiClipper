import { z } from 'zod';

/**
 * Configuration form schema (spec Section C). Validates the configure-page
 * payload before it is sent to PATCH /api/projects/:id + POST .../start.
 */

export const CLIP_LENGTH_PRESETS = [
  { id: 'auto', label: 'Auto (0m–3m)', min: 0, max: 180 },
  { id: '15-30', label: '15–30 seconds', min: 15, max: 30 },
  { id: '30-60', label: '30–60 seconds', min: 30, max: 60 },
  { id: '60-90', label: '60–90 seconds', min: 60, max: 90 },
  { id: 'custom', label: 'Custom', min: null, max: null },
] as const;

export const GENRE_OPTIONS = [
  'Auto', 'Podcast', 'News', 'Commentary', 'Marketing', 'Webinar',
  'Motivational', 'Academic', 'Listicle', 'Product reviews', 'How-to',
  'Comedy', 'Sports commentary', 'Vlog', 'Gaming', 'Others',
] as const;

export const CLIP_MODEL_OPTIONS = [
  'Auto', 'Fast Mode', 'Smart Mode', 'Highlight Mode', 'Podcast Mode',
  'News Mode', 'Gaming Mode', 'Custom Prompt Mode',
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'id', label: 'Indonesian' },
  { value: 'en', label: 'English' },
  { value: 'custom', label: 'Custom language code' },
] as const;

export const ASPECT_RATIOS = ['9:16', '1:1', '16:9'] as const;

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
  aspectRatio: z.enum(['9:16', '1:1', '16:9']),
  saveAsDefault: z.boolean().default(false),
});

export type ConfigureFormValues = z.infer<typeof configureSchema>;

/**
 * Map a clip model preset (spec C.5) to the processing_mode the worker reads.
 * Only "Fast Mode" maps to 'fast'; everything else uses 'balanced' (Smart).
 */
export function modelToProcessingMode(clipModel: string): 'fast' | 'balanced' | 'quality' {
  if (clipModel === 'Fast Mode') return 'fast';
  return 'balanced';
}

/** Estimate a rough "processing cost" for display (spec C.3 — not "credits"). */
export function estimateProcessingCost(
  durationSeconds: number | null | undefined,
  clipModel: string,
  clippingMode: string
): string {
  if (clippingMode === 'dont_clip') return 'Low (import only)';
  if (!durationSeconds) return 'Calculating…';
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const multiplier = clipModel === 'Fast Mode' ? 1 : clipModel === 'Auto' ? 1.2 : 1.5;
  const units = Math.round(minutes * multiplier);
  return `${units} processing units (~${minutes} min video)`;
}
