#!/usr/bin/env bash
set -e
PROJECT_DIR="/mnt/d/Krisna Taufik/Project Krisna/AiClipper"
PROJECT_ID="proj_81c52bc6-037a-4aa0-9008-e2097f27546b"
cd "$PROJECT_DIR"
export FFMPEG_PATH=/usr/bin/ffmpeg
export FFPROBE_PATH=/usr/bin/ffprobe
export PYTHON_PATH="$PROJECT_DIR/.venv/bin/python"
export WHISPER_DEVICE=cpu
export WHISPER_MODEL=base

/usr/bin/node - <<NODE
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:local.db' });
const crypto = require('crypto');
(async () => {
  await db.execute({ sql: 'UPDATE projects SET status = ? WHERE project_id = ?', args: ['PENDING', '$PROJECT_ID'] });
  await db.execute({ sql: 'DELETE FROM processing_jobs WHERE project_id = ? AND type = ?', args: ['$PROJECT_ID', 'PROCESS_VIDEO'] });
  await db.execute({ sql: 'DELETE FROM clips WHERE project_id = ?', args: ['$PROJECT_ID'] });
  const job_id = 'job_' + crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: 'INSERT INTO processing_jobs (job_id, project_id, type, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [job_id, '$PROJECT_ID', 'PROCESS_VIDEO', 'QUEUED', JSON.stringify({projectId: '$PROJECT_ID'}), now, now]
  });
  console.log('Reset and queued:', job_id);
})();
NODE

exec /usr/bin/node workers/processVideoWorker.mjs
