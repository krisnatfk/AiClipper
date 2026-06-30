/**
 * Direct SQL migration for AutoClip AI.
 *
 * Why this exists: drizzle-kit `push` fails on this machine with an
 * esbuild 0.19.12 + Node 22 "The service was stopped" error. Since the
 * project constraint forbids adding new dependencies, we apply the schema
 * changes directly via @libsql/client (already a dependency).
 *
 * Idempotent: every ALTER TABLE is guarded by a column-existence check,
 * every CREATE TABLE uses IF NOT EXISTS. Safe to re-run.
 *
 * Covers Chunk 1 changes:
 *  - New columns on `projects` (clipping_mode, auto_hook_enabled,
 *    timeframe_start/end_sec, caption_template_id, render_template_id,
 *    specific_moments_prompt).
 *  - `render_templates` table (with template_id, type, is_builtin, is_default,
 *    indexes) plus the other editor tables if missing.
 *
 * Usage:  node scripts/migrate.mjs
 */
import { createClient } from '@libsql/client';
import { readFile } from 'fs/promises';
import path from 'path';

async function loadDotEnv() {
  try {
    const content = await readFile(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const [k, ...v] = t.split('=');
      if (!process.env[k]) process.env[k] = v.join('=');
    }
  } catch {
    /* no .env */
  }
}

await loadDotEnv();

const db = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function tableExists(name) {
  const r = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    args: [name],
  });
  return r.rows.length > 0;
}

async function columnsOf(table) {
  const r = await db.execute({ sql: `PRAGMA table_info(${table})`, args: [] });
  return new Set(r.rows.map((row) => row.name));
}

async function addColumn(table, columnDef) {
  const cols = await columnsOf(table);
  if (cols.has(columnDef.name)) {
    return `skip (exists): ${table}.${columnDef.name}`;
  }
  await db.execute({
    sql: `ALTER TABLE ${table} ADD COLUMN ${columnDef.name} ${columnDef.def}`,
    args: [],
  });
  return `added: ${table}.${columnDef.name}`;
}

async function exec(sql) {
  await db.execute({ sql, args: [] });
}

async function migrate() {
  const log = [];
  const hasProjects = await tableExists('projects');
  if (!hasProjects) {
    throw new Error('projects table does not exist. Run the app once to create base schema, then re-run migrate.');
  }

  // --- projects: new columns ---
  const projectColumns = [
    { name: 'clipping_mode', def: "TEXT NOT NULL DEFAULT 'ai_clipping'" },
    { name: 'auto_hook_enabled', def: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'timeframe_start_sec', def: 'INTEGER' },
    { name: 'timeframe_end_sec', def: 'INTEGER' },
    { name: 'caption_template_id', def: 'TEXT' },
    { name: 'render_template_id', def: 'TEXT' },
    { name: 'specific_moments_prompt', def: 'TEXT' },
  ];
  for (const col of projectColumns) {
    log.push(await addColumn('projects', col));
  }

  // --- render_templates ---
  await exec(`
    CREATE TABLE IF NOT EXISTS render_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'caption',
      is_builtin INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      caption_style TEXT,
      hook_style TEXT,
      layout_style TEXT,
      logo_style TEXT,
      export_settings TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  log.push('table ensured: render_templates');
  await exec(`CREATE INDEX IF NOT EXISTS render_templates_template_id_idx ON render_templates(template_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS render_templates_type_idx ON render_templates(type)`);

  // --- clip_edits ---
  await exec(`
    CREATE TABLE IF NOT EXISTS clip_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clip_id TEXT NOT NULL,
      layout_config TEXT,
      caption_config TEXT,
      hook_config TEXT,
      render_config TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS clip_edits_clip_id_idx ON clip_edits(clip_id)`);
  log.push('table ensured: clip_edits');

  // --- clip_reframe_configs ---
  await exec(`
    CREATE TABLE IF NOT EXISTS clip_reframe_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clip_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'face-center-crop',
      fallback_mode TEXT NOT NULL DEFAULT 'fit-blur',
      aspect_ratio TEXT NOT NULL DEFAULT '9:16',
      output_width INTEGER NOT NULL DEFAULT 1080,
      output_height INTEGER NOT NULL DEFAULT 1920,
      face_detections TEXT,
      person_detections TEXT,
      selected_subjects TEXT,
      crop_boxes TEXT,
      smoothed_crop_boxes TEXT,
      manual_keyframes TEXT,
      safe_area_config TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS clip_reframe_configs_clip_id_idx ON clip_reframe_configs(clip_id)`);
  log.push('table ensured: clip_reframe_configs');

  // --- overlay_layers ---
  await exec(`
    CREATE TABLE IF NOT EXISTS overlay_layers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clip_id TEXT NOT NULL,
      type TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      z_index INTEGER NOT NULL DEFAULT 0,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS overlay_layers_clip_id_idx ON overlay_layers(clip_id)`);
  log.push('table ensured: overlay_layers');

  // --- tracking_keyframes ---
  await exec(`
    CREATE TABLE IF NOT EXISTS tracking_keyframes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      overlay_layer_id INTEGER NOT NULL,
      time INTEGER NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      config TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS tracking_keyframes_layer_id_idx ON tracking_keyframes(overlay_layer_id)`);
  log.push('table ensured: tracking_keyframes');

  // --- subtitle_segments ---
  await exec(`
    CREATE TABLE IF NOT EXISTS subtitle_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clip_id TEXT NOT NULL,
      word TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      is_highlighted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS subtitle_segments_clip_id_idx ON subtitle_segments(clip_id)`);
  log.push('table ensured: subtitle_segments');

  // Sanity report
  const rtCols = await columnsOf('render_templates');
  const projCols = await columnsOf('projects');
  console.log('Migration complete.');
  for (const line of log) console.log('  ' + line);
  console.log(`\nprojects columns: ${projCols.size}`);
  console.log(`render_templates columns: ${[...rtCols].join(', ')}`);
}

try {
  await migrate();
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
