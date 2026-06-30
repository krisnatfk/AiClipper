import { createClient } from '@libsql/client';

const databaseUrl = process.env.DATABASE_URL || 'file:local.db';
const client = createClient({ url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN });

const projectColumns = [
  "ALTER TABLE projects ADD COLUMN source_type TEXT NOT NULL DEFAULT 'direct_url'",
  'ALTER TABLE projects ADD COLUMN source_url TEXT',
  'ALTER TABLE projects ADD COLUMN source_file_path TEXT',
  'ALTER TABLE projects ADD COLUMN source_storage_url TEXT',
  "ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'DRAFT'",
  'ALTER TABLE projects ADD COLUMN progress INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE projects ADD COLUMN current_step TEXT',
  'ALTER TABLE projects ADD COLUMN error_message TEXT',
  'ALTER TABLE projects ADD COLUMN duration_seconds INTEGER',
  'ALTER TABLE projects ADD COLUMN width INTEGER',
  'ALTER TABLE projects ADD COLUMN height INTEGER',
  'ALTER TABLE projects ADD COLUMN fps TEXT',
  'ALTER TABLE projects ADD COLUMN codec TEXT',
  'ALTER TABLE projects ADD COLUMN file_size INTEGER',
  'ALTER TABLE projects ADD COLUMN language TEXT',
  'ALTER TABLE projects ADD COLUMN clip_count_requested INTEGER NOT NULL DEFAULT 5',
  'ALTER TABLE projects ADD COLUMN clip_min_seconds INTEGER NOT NULL DEFAULT 30',
  'ALTER TABLE projects ADD COLUMN clip_max_seconds INTEGER NOT NULL DEFAULT 90',
  "ALTER TABLE projects ADD COLUMN aspect_ratio TEXT NOT NULL DEFAULT '9:16'",
  "ALTER TABLE projects ADD COLUMN processing_mode TEXT NOT NULL DEFAULT 'balanced'",
  "ALTER TABLE projects ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'gemini'",
  "ALTER TABLE projects ADD COLUMN transcription_engine TEXT NOT NULL DEFAULT 'faster-whisper'",
  'ALTER TABLE projects ADD COLUMN raw_metadata TEXT',
  'ALTER TABLE projects ADD COLUMN completed_at TEXT',
];

const clipColumns = [
  'ALTER TABLE clips ADD COLUMN clip_id TEXT',
  'ALTER TABLE clips ADD COLUMN clip_plan_id TEXT',
  'ALTER TABLE clips ADD COLUMN hook_text TEXT',
  'ALTER TABLE clips ADD COLUMN caption TEXT',
  'ALTER TABLE clips ADD COLUMN start_sec INTEGER',
  'ALTER TABLE clips ADD COLUMN end_sec INTEGER',
  'ALTER TABLE clips ADD COLUMN duration_seconds INTEGER',
  'ALTER TABLE clips ADD COLUMN score INTEGER',
  'ALTER TABLE clips ADD COLUMN output_file_path TEXT',
  'ALTER TABLE clips ADD COLUMN output_storage_url TEXT',
  'ALTER TABLE clips ADD COLUMN thumbnail_file_path TEXT',
  'ALTER TABLE clips ADD COLUMN thumbnail_storage_url TEXT',
  'ALTER TABLE clips ADD COLUMN subtitle_file_path TEXT',
  "ALTER TABLE clips ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING'",
  'ALTER TABLE clips ADD COLUMN error_message TEXT',
];

const tables = [
  `CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    language TEXT,
    full_text TEXT,
    segments TEXT,
    words TEXT,
    engine TEXT,
    raw_response TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS clip_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clip_plan_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    start_sec INTEGER NOT NULL,
    end_sec INTEGER NOT NULL,
    title TEXT NOT NULL,
    hook_text TEXT NOT NULL,
    caption TEXT,
    hashtags TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    score_breakdown TEXT,
    reason TEXT,
    ai_raw_response TEXT,
    status TEXT NOT NULL DEFAULT 'PLANNED',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS processing_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    progress INTEGER NOT NULL DEFAULT 0,
    payload TEXT,
    result TEXT,
    error_message TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS processing_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    job_id TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    step TEXT NOT NULL,
    message TEXT NOT NULL,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

const indexes = [
  'CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status)',
  'CREATE INDEX IF NOT EXISTS clip_id_idx ON clips(clip_id)',
  'CREATE INDEX IF NOT EXISTS transcripts_project_id_idx ON transcripts(project_id)',
  'CREATE INDEX IF NOT EXISTS clip_plan_id_idx ON clip_plans(clip_plan_id)',
  'CREATE INDEX IF NOT EXISTS clip_plans_project_id_idx ON clip_plans(project_id)',
  'CREATE INDEX IF NOT EXISTS processing_jobs_job_id_idx ON processing_jobs(job_id)',
  'CREATE INDEX IF NOT EXISTS processing_jobs_project_id_idx ON processing_jobs(project_id)',
  'CREATE INDEX IF NOT EXISTS processing_jobs_status_idx ON processing_jobs(status)',
  'CREATE INDEX IF NOT EXISTS processing_logs_project_id_idx ON processing_logs(project_id)',
  'CREATE INDEX IF NOT EXISTS processing_logs_job_id_idx ON processing_logs(job_id)',
];

async function exec(statement) {
  try {
    await client.execute(statement);
  } catch (error) {
    if (String(error?.message || '').includes('duplicate column name')) return;
    throw error;
  }
}

for (const statement of [...projectColumns, ...clipColumns, ...tables, ...indexes]) {
  await exec(statement);
}

console.log(`Self-processing migration applied to ${databaseUrl}`);

