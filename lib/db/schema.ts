import { sql } from 'drizzle-orm';
import { integer, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';

/**
 * Boolean stored as 0/1 in SQLite.
 * Drizzle's `integer({ mode: 'boolean' })` handles (de)serialization.
 */

/**
 * Projects Table
 * Stores video projects created for clipping
 */
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project_id: text('project_id').notNull().unique(),
    source_type: text('source_type').notNull().default('direct_url'),
    source_url: text('source_url'),
    source_file_path: text('source_file_path'),
    source_storage_url: text('source_storage_url'),
    status: text('status').notNull().default('DRAFT'),
    progress: integer('progress').notNull().default(0),
    current_step: text('current_step'),
    error_message: text('error_message'),
    duration_seconds: integer('duration_seconds'),
    width: integer('width'),
    height: integer('height'),
    fps: text('fps'),
    codec: text('codec'),
    file_size: integer('file_size'),
    language: text('language'),
    clip_count_requested: integer('clip_count_requested').notNull().default(5),
    clip_min_seconds: integer('clip_min_seconds').notNull().default(30),
    clip_max_seconds: integer('clip_max_seconds').notNull().default(90),
    aspect_ratio: text('aspect_ratio').notNull().default('9:16'),
    processing_mode: text('processing_mode').notNull().default('balanced'),
    /**
     * Clipping mode: 'ai_clipping' (auto-find moments) | 'dont_clip' (import to editor only).
     * See spec Section C.4 mode tabs.
     */
    clipping_mode: text('clipping_mode').notNull().default('ai_clipping'),
    /**
     * Auto hook: when true the system generates a text hook in the first 3-5s of each clip.
     * Editable later in the editor. See spec Section C.8.
     */
    auto_hook_enabled: integer('auto_hook_enabled', { mode: 'boolean' }).notNull().default(true),
    /**
     * Processing timeframe: restrict analysis/render to a sub-range of the source video.
     * Spec Section C.10. Nullable = full video.
     */
    timeframe_start_sec: integer('timeframe_start_sec'),
    timeframe_end_sec: integer('timeframe_end_sec'),
    /**
     * Selected caption + render template ids (FK-ish to render_templates.id stored as text name slug).
     * Spec Section C.11 / G. Kept nullable so a project can be created before a template is chosen.
     */
    caption_template_id: text('caption_template_id'),
    render_template_id: text('render_template_id'),
    /**
     * Free-form specific-moments prompt. Spec Section C.9.
     */
    specific_moments_prompt: text('specific_moments_prompt'),
    ai_provider: text('ai_provider').notNull().default('gemini'),
    transcription_engine: text('transcription_engine').notNull().default('faster-whisper'),
    raw_metadata: text('raw_metadata', { mode: 'json' }),
    org_id: text('org_id'),
    user_id: text('user_id'),
    title: text('title').notNull(),
    source_platform: text('source_platform'),
    source_id: text('source_id'),
    source_uri: text('source_uri'),
    video_url: text('video_url').notNull(),
    model: text('model').notNull().default('Smart Mode'),
    genre: text('genre'),
    stage: text('stage').notNull().default('PENDING'),
    visibility: text('visibility'),
    storage_size: integer('storage_size'),
    storage_status: text('storage_status'),
    storage_expire_at: text('storage_expire_at'),
    curation_pref: text('curation_pref', { mode: 'json' }),
    render_pref: text('render_pref', { mode: 'json' }),
    import_pref: text('import_pref', { mode: 'json' }),
    raw_response: text('raw_response', { mode: 'json' }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completed_at: text('completed_at'),
  },
  (table) => ({
    projectIdIdx: index('project_id_idx').on(table.project_id),
    stageIdx: index('stage_idx').on(table.stage),
    statusIdx: index('projects_status_idx').on(table.status),
    createdAtIdx: index('projects_created_at_idx').on(table.created_at),
  })
);

/**
 * Clips Table
 * Stores individual video clips generated from projects
 */
export const clips = sqliteTable(
  'clips',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clip_id: text('clip_id'),
    clip_plan_id: text('clip_plan_id'),
    opus_clip_id: text('opus_clip_id').unique(),
    project_id: text('project_id').notNull(),
    run_id: text('run_id'),
    curation_id: text('curation_id'),
    org_id: text('org_id'),
    user_id: text('user_id'),
    title: text('title').notNull(),
    text: text('text'),
    description: text('description'),
    hashtags: text('hashtags'),
    hook_text: text('hook_text'),
    caption: text('caption'),
    start_sec: integer('start_sec'),
    end_sec: integer('end_sec'),
    duration_seconds: integer('duration_seconds'),
    score: integer('score'),
    output_file_path: text('output_file_path'),
    output_storage_url: text('output_storage_url'),
    thumbnail_file_path: text('thumbnail_file_path'),
    thumbnail_storage_url: text('thumbnail_storage_url'),
    subtitle_file_path: text('subtitle_file_path'),
    status: text('status').notNull().default('PENDING'),
    error_message: text('error_message'),
    keywords: text('keywords', { mode: 'json' }),
    prompt_name: text('prompt_name'),
    genre: text('genre'),
    subgenre: text('subgenre'),
    duration_ms: integer('duration_ms'),
    storage_used: integer('storage_used'),
    time_ranges: text('time_ranges', { mode: 'json' }),
    uri_for_preview: text('uri_for_preview'),
    uri_for_export: text('uri_for_export'),
    render_pref: text('render_pref', { mode: 'json' }),
    raw_response: text('raw_response', { mode: 'json' }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    opusClipIdIdx: index('opus_clip_id_idx').on(table.opus_clip_id),
    clipIdIdx: index('clip_id_idx').on(table.clip_id),
    projectIdIdx: index('clips_project_id_idx').on(table.project_id),
    createdAtIdx: index('clips_created_at_idx').on(table.created_at),
  })
);

export const transcripts = sqliteTable(
  'transcripts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project_id: text('project_id').notNull(),
    language: text('language'),
    full_text: text('full_text'),
    segments: text('segments', { mode: 'json' }),
    words: text('words', { mode: 'json' }),
    engine: text('engine'),
    raw_response: text('raw_response', { mode: 'json' }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdIdx: index('transcripts_project_id_idx').on(table.project_id),
  })
);

export const clipPlans = sqliteTable(
  'clip_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clip_plan_id: text('clip_plan_id').notNull().unique(),
    project_id: text('project_id').notNull(),
    start_sec: integer('start_sec').notNull(),
    end_sec: integer('end_sec').notNull(),
    title: text('title').notNull(),
    hook_text: text('hook_text').notNull(),
    caption: text('caption'),
    hashtags: text('hashtags', { mode: 'json' }),
    score: integer('score').notNull().default(0),
    score_breakdown: text('score_breakdown', { mode: 'json' }),
    reason: text('reason'),
    ai_raw_response: text('ai_raw_response', { mode: 'json' }),
    status: text('status').notNull().default('PLANNED'),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    clipPlanIdIdx: index('clip_plan_id_idx').on(table.clip_plan_id),
    projectIdIdx: index('clip_plans_project_id_idx').on(table.project_id),
  })
);

export const processingJobs = sqliteTable(
  'processing_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    job_id: text('job_id').notNull().unique(),
    project_id: text('project_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('QUEUED'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    max_attempts: integer('max_attempts').notNull().default(3),
    progress: integer('progress').notNull().default(0),
    payload: text('payload', { mode: 'json' }),
    result: text('result', { mode: 'json' }),
    error_message: text('error_message'),
    started_at: text('started_at'),
    completed_at: text('completed_at'),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdIdx: index('processing_jobs_job_id_idx').on(table.job_id),
    projectIdIdx: index('processing_jobs_project_id_idx').on(table.project_id),
    statusIdx: index('processing_jobs_status_idx').on(table.status),
  })
);

export const processingLogs = sqliteTable(
  'processing_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project_id: text('project_id').notNull(),
    job_id: text('job_id'),
    level: text('level').notNull().default('info'),
    step: text('step').notNull(),
    message: text('message').notNull(),
    meta: text('meta', { mode: 'json' }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdIdx: index('processing_logs_project_id_idx').on(table.project_id),
    jobIdIdx: index('processing_logs_job_id_idx').on(table.job_id),
  })
);

/**
 * Brand Templates Table
 * Stores brand templates synced from OpusClip API
 */
export const brandTemplates = sqliteTable(
  'brand_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    brand_template_id: text('brand_template_id').notNull().unique(),
    name: text('name'),
    is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    raw_response: text('raw_response', { mode: 'json' }),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    brandTemplateIdIdx: index('brand_template_id_idx').on(table.brand_template_id),
  })
);

/**
 * API Logs Table
 * Stores logs of all OpusClip API requests and responses
 */
export const apiLogs = sqliteTable(
  'api_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    endpoint: text('endpoint').notNull(),
    method: text('method').notNull(),
    request_payload: text('request_payload', { mode: 'json' }),
    response_payload: text('response_payload', { mode: 'json' }),
    status_code: integer('status_code'),
    error_message: text('error_message'),
    created_at: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index('api_logs_created_at_idx').on(table.created_at),
  })
);

// Type exports for use in application code
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;

export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;

export type ClipPlan = typeof clipPlans.$inferSelect;
export type NewClipPlan = typeof clipPlans.$inferInsert;

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;

export type ProcessingLog = typeof processingLogs.$inferSelect;
export type NewProcessingLog = typeof processingLogs.$inferInsert;

export type BrandTemplate = typeof brandTemplates.$inferSelect;
export type NewBrandTemplate = typeof brandTemplates.$inferInsert;

export type ApiLog = typeof apiLogs.$inferSelect;
export type NewApiLog = typeof apiLogs.$inferInsert;

/**
 * Editor Tables
 */

export const renderTemplates = sqliteTable(
  'render_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /**
     * Stable slug id (e.g. "karaoke", "beasty"). Used as the value stored in
     * projects.caption_template_id / projects.render_template_id so references
     * survive id renumbering during re-seeds. See spec Section G / C.11.
     */
    template_id: text('template_id').notNull().unique(),
    name: text('name').notNull(),
    /**
     * Template category: 'caption' (caption presets) | 'render' (full render templates)
     * | 'hook' (hook styles). Spec G calls these render_templates but Section C.11
     * distinguishes caption templates. We keep one table and tag by type.
     */
    type: text('type').notNull().default('caption'),
    /**
     * Builtin presets shipped via the seed script are marked is_builtin=true and
     * cannot be deleted from the UI (only user-created rows can). is_default marks
     * the one applied to new projects by default.
     */
    is_builtin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
    is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    caption_style: text('caption_style', { mode: 'json' }),
    hook_style: text('hook_style', { mode: 'json' }),
    layout_style: text('layout_style', { mode: 'json' }),
    logo_style: text('logo_style', { mode: 'json' }),
    export_settings: text('export_settings', { mode: 'json' }),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    templateIdIdx: index('render_templates_template_id_idx').on(table.template_id),
    typeIdx: index('render_templates_type_idx').on(table.type),
  })
);

export const clipEdits = sqliteTable(
  'clip_edits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clip_id: text('clip_id').notNull(),
    layout_config: text('layout_config', { mode: 'json' }),
    caption_config: text('caption_config', { mode: 'json' }),
    hook_config: text('hook_config', { mode: 'json' }),
    render_config: text('render_config', { mode: 'json' }),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    clipIdIdx: index('clip_edits_clip_id_idx').on(table.clip_id),
  })
);

export const clipReframeConfigs = sqliteTable(
  'clip_reframe_configs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clip_id: text('clip_id').notNull(),
    mode: text('mode').notNull().default('face-center-crop'),
    fallback_mode: text('fallback_mode').notNull().default('fit-blur'),
    aspect_ratio: text('aspect_ratio').notNull().default('9:16'),
    output_width: integer('output_width').notNull().default(1080),
    output_height: integer('output_height').notNull().default(1920),
    face_detections: text('face_detections', { mode: 'json' }),
    person_detections: text('person_detections', { mode: 'json' }),
    selected_subjects: text('selected_subjects', { mode: 'json' }),
    crop_boxes: text('crop_boxes', { mode: 'json' }),
    smoothed_crop_boxes: text('smoothed_crop_boxes', { mode: 'json' }),
    manual_keyframes: text('manual_keyframes', { mode: 'json' }),
    safe_area_config: text('safe_area_config', { mode: 'json' }),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    clipIdIdx: index('clip_reframe_configs_clip_id_idx').on(table.clip_id),
  })
);

export const overlayLayers = sqliteTable(
  'overlay_layers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clip_id: text('clip_id').notNull(),
    type: text('type').notNull(), // text, hook, subtitle, box, arrow, blur, image
    start_time: integer('start_time').notNull(),
    end_time: integer('end_time').notNull(),
    z_index: integer('z_index').notNull().default(0),
    config: text('config', { mode: 'json' }),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    clipIdIdx: index('overlay_layers_clip_id_idx').on(table.clip_id),
  })
);

export const trackingKeyframes = sqliteTable(
  'tracking_keyframes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    overlay_layer_id: integer('overlay_layer_id').notNull(),
    time: integer('time').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    config: text('config', { mode: 'json' }),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    layerIdIdx: index('tracking_keyframes_layer_id_idx').on(table.overlay_layer_id),
  })
);

export const subtitleSegments = sqliteTable(
  'subtitle_segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clip_id: text('clip_id').notNull(),
    word: text('word').notNull(),
    start_time: integer('start_time').notNull(),
    end_time: integer('end_time').notNull(),
    is_highlighted: integer('is_highlighted', { mode: 'boolean' }).default(false),
    created_at: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    clipIdIdx: index('subtitle_segments_clip_id_idx').on(table.clip_id),
  })
);

export type RenderTemplate = typeof renderTemplates.$inferSelect;
export type NewRenderTemplate = typeof renderTemplates.$inferInsert;

export type ClipEdit = typeof clipEdits.$inferSelect;
export type NewClipEdit = typeof clipEdits.$inferInsert;

export type ClipReframeConfig = typeof clipReframeConfigs.$inferSelect;
export type NewClipReframeConfig = typeof clipReframeConfigs.$inferInsert;

export type OverlayLayer = typeof overlayLayers.$inferSelect;
export type NewOverlayLayer = typeof overlayLayers.$inferInsert;

export type TrackingKeyframe = typeof trackingKeyframes.$inferSelect;
export type NewTrackingKeyframe = typeof trackingKeyframes.$inferInsert;

export type SubtitleSegment = typeof subtitleSegments.$inferSelect;
export type NewSubtitleSegment = typeof subtitleSegments.$inferInsert;
