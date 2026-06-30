#!/usr/bin/env bash
set -e
PROJECT_DIR="/mnt/d/Krisna Taufik/Project Krisna/AiClipper"
cd "$PROJECT_DIR"
export FFMPEG_PATH=/usr/bin/ffmpeg
export FFPROBE_PATH=/usr/bin/ffprobe
export PYTHON_PATH="$PROJECT_DIR/.venv/bin/python"
export WHISPER_DEVICE=cpu

# Reset project and queue a fresh PROCESS_VIDEO job
/usr/bin/node - <<'NODE'
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:local.db' });
const crypto = require('crypto');
(async () => {
  const project_id = 'proj_e3d21947-cde7-4b25-be2c-c77b1b9c266e';
  await db.execute({ sql: 'UPDATE projects SET status = ? WHERE project_id = ?', args: ['PENDING', project_id] });
  await db.execute({ sql: 'DELETE FROM processing_jobs WHERE project_id = ? AND type = ?', args: [project_id, 'PROCESS_VIDEO'] });
  await db.execute({ sql: 'DELETE FROM clips WHERE project_id = ?', args: [project_id] });
  const job_id = 'job_' + crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: 'INSERT INTO processing_jobs (job_id, project_id, type, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [job_id, project_id, 'PROCESS_VIDEO', 'QUEUED', JSON.stringify({projectId: project_id}), now, now]
  });
  console.log('Reset project and queued job:', job_id);
})();
NODE

# Start worker
exec /usr/bin/node workers/processVideoWorker.mjs
