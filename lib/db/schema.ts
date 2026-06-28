import { sql } from 'drizzle-orm';
import { integer, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';

/**
 * Projects Table
 * Stores video projects created for clipping
 */
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project_id: text('project_id').notNull().unique(),
    org_id: text('org_id'),
    user_id: text('user_id'),
    title: text('title').notNull(),
    source_platform: text('source_platform'),
    source_id: text('source_id'),
    source_uri: text('source_uri'),
    video_url: text('video_url').notNull(),
    model: text('model').notNull(),
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
  },
  (table) => ({
    projectIdIdx: index('project_id_idx').on(table.project_id),
    stageIdx: index('stage_idx').on(table.stage),
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
    opus_clip_id: text('opus_clip_id').notNull().unique(),
    project_id: text('project_id').notNull(),
    run_id: text('run_id'),
    curation_id: text('curation_id'),
    org_id: text('org_id'),
    user_id: text('user_id'),
    title: text('title').notNull(),
    text: text('text'),
    description: text('description'),
    hashtags: text('hashtags'),
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
    projectIdIdx: index('clips_project_id_idx').on(table.project_id),
    createdAtIdx: index('clips_created_at_idx').on(table.created_at),
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

export type BrandTemplate = typeof brandTemplates.$inferSelect;
export type NewBrandTemplate = typeof brandTemplates.$inferInsert;

export type ApiLog = typeof apiLogs.$inferSelect;
export type NewApiLog = typeof apiLogs.$inferInsert;
