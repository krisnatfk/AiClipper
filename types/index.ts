// Database Models
export interface Project {
  id: number;
  project_id: string;
  source_type: string;
  source_url?: string | null;
  source_file_path?: string | null;
  source_storage_url?: string | null;
  status: ProjectStatus | string;
  progress: number;
  current_step?: string | null;
  error_message?: string | null;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: string | null;
  codec?: string | null;
  file_size?: number | null;
  language?: string | null;
  clip_count_requested: number;
  clip_min_seconds: number;
  clip_max_seconds: number;
  aspect_ratio: string;
  processing_mode: string;
  /**
   * Clipping mode value as stored on the DB row (string). Use ClippingMode
   * union at the form/config boundary with runtime narrowing. Kept as string
   * here to match Drizzle's TEXT-column inference, consistent with how
   * status/stage/processing_mode above are typed as string.
   */
  clipping_mode: string;
  /** Auto hook toggle (spec C.8). Stored as integer boolean in SQLite. */
  auto_hook_enabled: boolean;
  /** Processing timeframe bounds (spec C.10). Nullable = full video. */
  timeframe_start_sec?: number | null;
  timeframe_end_sec?: number | null;
  /** Selected caption / render template slug ids (spec C.11 / G). */
  caption_template_id?: string | null;
  render_template_id?: string | null;
  /** Free-form specific-moments prompt (spec C.9). */
  specific_moments_prompt?: string | null;
  ai_provider: string;
  transcription_engine: string;
  raw_metadata?: any;
  org_id?: string | null;
  user_id?: string | null;
  title: string;
  source_platform?: string | null;
  source_id?: string | null;
  source_uri?: string | null;
  video_url: string;
  model: string;
  genre?: string | null;
  stage: ProjectStage | string;
  visibility?: string | null;
  storage_size?: number | null;
  storage_status?: string | null;
  storage_expire_at?: string | null;
  curation_pref?: any;
  render_pref?: any;
  import_pref?: any;
  raw_response?: any;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export type ProjectStage =
  | ProjectStatus
  | 'PENDING'
  | 'QUEUED'
  | 'IMPORT'
  | 'CURATE'
  | 'REFINE'
  | 'RENDER'
  | 'UPLOAD'
  | 'COMPLETE'
  | 'STALLED'
  | 'FAILED';

export type ProjectStatus =
  | 'DRAFT'
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROBING'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'ANALYZING'
  | 'PLANNING_CLIPS'
  | 'RENDERING'
  | 'UPLOADING_OUTPUT'
  | 'COMPLETED'
  | 'PARTIAL_COMPLETED'
  | 'FAILED'
  | 'CANCELED';

/**
 * Clipping mode tabs (spec Section C.4).
 * - ai_clipping: system auto-finds best moments and renders short clips.
 * - dont_clip: system only imports the video into the editor (no auto-cut).
 */
export type ClippingMode = 'ai_clipping' | 'dont_clip';

/**
 * Clip model presets (spec Section C.5). Mapped to processing_mode + model
 * fields on the project at submit time.
 */
export type ClipModel =
  | 'Auto'
  | 'Fast Mode'
  | 'Smart Mode'
  | 'Highlight Mode'
  | 'Podcast Mode'
  | 'News Mode'
  | 'Gaming Mode'
  | 'Custom Prompt Mode';

/**
 * Render template category. One table, tagged by type (spec G vs C.11).
 */
export type RenderTemplateType = 'caption' | 'render' | 'hook';

export interface Clip {
  id: number;
  clip_id?: string | null;
  clip_plan_id?: string | null;
  opus_clip_id?: string | null;
  project_id: string;
  run_id?: string | null;
  curation_id?: string | null;
  org_id?: string | null;
  user_id?: string | null;
  title: string;
  text?: string | null;
  description?: string | null;
  hashtags?: string | null;
  hook_text?: string | null;
  caption?: string | null;
  start_sec?: number | null;
  end_sec?: number | null;
  duration_seconds?: number | null;
  score?: number | null;
  output_file_path?: string | null;
  output_storage_url?: string | null;
  thumbnail_file_path?: string | null;
  thumbnail_storage_url?: string | null;
  subtitle_file_path?: string | null;
  status?: string | null;
  error_message?: string | null;
  keywords?: unknown;
  prompt_name?: string | null;
  genre?: string | null;
  subgenre?: string | null;
  duration_ms?: number | null;
  storage_used?: number | null;
  time_ranges?: unknown;
  uri_for_preview?: string | null;
  uri_for_export?: string | null;
  render_pref?: any;
  raw_response?: any;
  created_at: string;
  updated_at: string;
}

export interface BrandTemplate {
  id: number;
  brand_template_id: string;
  name?: string;
  is_default: boolean;
  raw_response?: any;
  created_at: string;
  updated_at: string;
}

/**
 * Caption style JSON shape (spec Section C.11 example). Shared by render_templates
 * caption_style column and the editor store.
 */
export interface CaptionStyle {
  id?: string;
  name?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  highlightEnabled: boolean;
  highlightColor: string;
  uppercase: boolean;
  animation: 'none' | 'pop' | 'fade' | 'slide' | 'karaoke' | 'bounce' | 'glitch' | 'scale-in';
  position: 'top' | 'middle' | 'bottom';
  maxWordsPerLine: number;
  shadow?: boolean;
  shadowColor?: string;
  backgroundColor?: string;
}

/**
 * Hook style JSON shape (spec Section G hook_style).
 */
export interface HookStyle {
  text: string;
  position: 'top' | 'middle' | 'bottom';
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  startTime: number;
  endTime: number;
  animation: 'none' | 'pop' | 'fade' | 'scale-in';
}

/**
 * Layout style JSON shape (spec Section G layout_style).
 */
export interface LayoutStyle {
  mode: 'fit' | 'fill' | 'split-top-bottom' | 'manual-crop' | '9:16' | '1:1' | '16:9';
  aspectRatio?: string;
  topRegion?: { x: number; y: number; width: number; height: number };
  bottomRegion?: { x: number; y: number; width: number; height: number };
}

/**
 * Export settings JSON shape (spec Section G export_settings).
 */
export interface ExportSettings {
  resolution?: string;
  format?: 'mp4' | 'mov' | 'webm';
  quality?: 'draft' | 'standard' | 'high';
  videoBitrate?: string;
  audioBitrate?: string;
}

/**
 * Render template row (render_templates table). Spec Section G.
 */
export interface RenderTemplate {
  id: number;
  template_id: string;
  name: string;
  /** Template category as stored on the DB row (string). Use RenderTemplateType
   * union at the form boundary with runtime narrowing. Kept as string to match
   * Drizzle's TEXT-column inference. */
  type: string;
  is_builtin: boolean;
  is_default: boolean;
  caption_style?: CaptionStyle | null;
  hook_style?: HookStyle | null;
  layout_style?: LayoutStyle | null;
  logo_style?: any;
  export_settings?: ExportSettings | null;
  created_at: string;
  updated_at: string;
}

export interface ApiLog {
  id: number;
  endpoint: string;
  method: string;
  request_payload?: any;
  response_payload?: any;
  status_code?: number;
  error_message?: string;
  created_at: string;
}

// OpusClip API Types
export interface CreateProjectPayload {
  videoUrl: string;
  uploadedVideoAttr?: {
    title: string;
  };
  curationPref?: {
    model: 'ClipBasic' | 'ClipAnything';
    clipDurations?: Array<[number, number]>;
    genre?: string;
    topicKeywords?: string[];
    customPrompt?: string;
    range?: {
      startSec: number;
      endSec: number;
    };
  };
  renderPref?: {
    layoutAspectRatio?: 'portrait' | 'square' | 'landscape';
    quickstartConfig?: {
      enableRemoveFillerWords?: boolean;
    };
    enableCaption?: boolean;
    enableHighlight?: boolean;
    enableEmoji?: boolean;
    enableUppercase?: boolean;
  };
  importPref?: {
    sourceLang?: string;
  };
  brandTemplateId?: string;
  conclusionActions?: any;
}

export interface OpusClipProject {
  id: string;
  orgId?: string;
  userId?: string;
  title?: string;
  sourcePlatform?: string;
  sourceId?: string;
  sourceUri?: string;
  videoUrl?: string;
  model?: string;
  genre?: string;
  stage?: string;
  visibility?: string;
  storageSize?: number;
  storageStatus?: string;
  storageExpireAt?: string;
  curationPref?: any;
  renderPref?: any;
  importPref?: any;
}

export interface OpusClip {
  id: string;
  projectId: string;
  runId?: string;
  curationId?: string;
  title?: string;
  text?: string;
  description?: string;
  hashtags?: string;
  keywords?: string[];
  promptName?: string;
  genre?: string;
  subgenre?: string;
  durationMs?: number;
  storageUsed?: number;
  timeRanges?: Array<[number, number]>;
  uriForPreview?: string;
  uriForExport?: string;
  renderPref?: any;
}

// Form Types
export interface CreateProjectFormData {
  videoUrl?: string;
  file?: File;
  title: string;
  sourceLang: string;
  model: 'Fast Mode' | 'Smart Mode';
  genre: string;
  topicKeywords: string;
  customPrompt?: string;
  clipDurationMin: number;
  clipDurationMax: number;
  rangeStartSec?: number;
  rangeEndSec?: number;
  brandTemplateId?: string;
  layoutAspectRatio: 'portrait' | 'square' | 'landscape';
  aspectRatio?: '9:16' | '1:1' | '16:9';
  enableRemoveFillerWords: boolean;
  enableCaption: boolean;
  enableEmoji: boolean;
  enableHighlight: boolean;
  enableUppercase: boolean;
  conclusionAction: 'none' | 'email' | 'webhook';
}

// API Response Types
export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

// Component Prop Types
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export interface BadgeProps {
  variant?: 'success' | 'alert' | 'energy' | 'accent' | 'default';
  children: React.ReactNode;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export interface StatusBadgeProps {
  stage: ProjectStage | string;
}

// Utility Types
export type SafeAny = any;
