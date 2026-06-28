// Database Models
export interface Project {
  id: number;
  project_id: string;
  org_id?: string;
  user_id?: string;
  title: string;
  source_platform?: string;
  source_id?: string;
  source_uri?: string;
  video_url: string;
  model: 'ClipBasic' | 'ClipAnything';
  genre?: string;
  stage: ProjectStage;
  visibility?: string;
  storage_size?: number;
  storage_status?: string;
  storage_expire_at?: string;
  curation_pref?: any;
  render_pref?: any;
  import_pref?: any;
  raw_response?: any;
  created_at: string;
  updated_at: string;
}

export type ProjectStage =
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

export interface Clip {
  id: number;
  opus_clip_id: string;
  project_id: string;
  run_id?: string;
  curation_id?: string;
  org_id?: string;
  user_id?: string;
  title: string;
  text?: string;
  description?: string;
  hashtags?: string;
  keywords?: string[];
  prompt_name?: string;
  genre?: string;
  subgenre?: string;
  duration_ms?: number;
  storage_used?: number;
  time_ranges?: Array<[number, number]>;
  uri_for_preview?: string;
  uri_for_export?: string;
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
  videoUrl: string;
  title: string;
  sourceLang: string;
  model: 'ClipBasic' | 'ClipAnything';
  genre: string;
  topicKeywords: string;
  customPrompt?: string;
  clipDurationMin: number;
  clipDurationMax: number;
  rangeStartSec?: number;
  rangeEndSec?: number;
  brandTemplateId?: string;
  layoutAspectRatio: 'portrait' | 'square' | 'landscape';
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
  stage: ProjectStage;
}

// Utility Types
export type SafeAny = any;
