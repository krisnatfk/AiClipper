# YouTube URL Ingestion Spec

## Goal
Enable users to paste a YouTube URL on the Create page. The backend creates a project, resolves the URL, downloads the video via yt-dlp in the worker, and then treats the saved file exactly like an uploaded MP4.

## Supported URLs
- `https://youtu.be/<id>` (with or without query params)
- `https://www.youtube.com/watch?v=<id>`
- `https://youtube.com/shorts/<id>`

## Architecture

```
Create Page (HeroCreateInput)
    ↓ POST /api/projects
API route (app/api/projects/route.ts)
    ↓ validate YouTube URL
    ↓ insert project row (source_type='youtube', status='SOURCE_RESOLVING')
    ↓ enqueue DOWNLOAD_SOURCE job
    ↓ redirect user to /projects/:id/configure
Worker (workers/processVideoWorker.mjs)
    ↓ claim DOWNLOAD_SOURCE job
    ↓ SOURCE_RESOLVING → DOWNLOADING_SOURCE
    ↓ run yt-dlp to storage/uploads/:projectId.mp4
    ↓ probe with ffprobe
    ↓ update project (source_file_path, duration_seconds, status='UPLOADED')
    ↓ complete job
User clicks "Get clips in 1 click" on /projects/:id/configure
    ↓ POST /api/projects/:id/start
    ↓ enqueue PROCESS_VIDEO / IMPORT_ONLY job
Worker
    ↓ resolveProjectSource finds local source_file_path
    ↓ normal pipeline continues
```

## Database

No schema changes are required — the existing `projects` table already contains:
- `source_type` → 'upload' | 'direct_url' | 'youtube'
- `source_url`
- `source_file_path`
- `status`
- `error_message`
- `duration_seconds`

We only add new enum-like values for `status` / `stage`:
- `SOURCE_RESOLVING`
- `DOWNLOADING_SOURCE`
- `SOURCE_READY`
- `UPLOADED` (reuse after download)
- `FAILED`

## Backend API changes

### 1. YouTube URL utility

Create `lib/video/youtubeUrl.ts`:

```ts
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export function normalizeYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
```

### 2. Update `app/api/projects/route.ts`

In `POST`:
1. Detect YouTube URL before the current `detectPlatform`/`isDirectVideoUrl` checks.
2. Validate `MAX_VIDEO_DURATION_MINUTES` is not enforced yet (we don't know duration until metadata is resolved; enforce in worker).
3. Create project with:
   - `source_type: 'youtube'`
   - `source_url: normalizeYouTubeUrl(videoId)`
   - `video_url: source_url`
   - `status: 'SOURCE_RESOLVING'`
   - `stage: 'SOURCE_RESOLVING'`
   - `current_step: 'YouTube link detected. Preparing source video...'`
4. Enqueue `DOWNLOAD_SOURCE` job via new queue helper.
5. Return `{ data: project, meta: { nextStep: 'configure', configureUrl: ... } }`.

### 3. New queue helper

Extend `lib/queue/databaseQueue.ts`:

```ts
export type JobType = 'PROCESS_VIDEO' | 'IMPORT_ONLY' | 'RENDER_CLIP' | 'DOWNLOAD_SOURCE';

export async function enqueueDownloadSourceJob(projectId: string, payload = {}) {
  return enqueueJob('DOWNLOAD_SOURCE', projectId, payload);
}
```

### 4. Worker changes

In `workers/processVideoWorker.mjs`:

1. Extend `getQueuedJob()` SQL to include `'DOWNLOAD_SOURCE'`.
2. Add a `processJob` dispatcher that routes job types to handlers:
   - `DOWNLOAD_SOURCE` → `processDownloadSourceJob`
   - `PROCESS_VIDEO` → `processProcessVideoJob`
   - `IMPORT_ONLY` → `processImportOnlyJob`
   - `RENDER_CLIP` → `processRenderClipJob`
3. Implement `processDownloadSourceJob(job)`:
   - Load project.
   - Update status to `DOWNLOADING_SOURCE`.
   - Run `getYtdlpPath()` → use env var `YTDLP_PATH` or try `yt-dlp`/`yt-dlp.exe` on PATH.
   - Validate yt-dlp exists; if not throw clear error.
   - Build output path: `storage/uploads/:projectId.%(ext)s`.
   - Run:
     ```
     yt-dlp -f "bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
            --merge-output-format mp4 \
            --output "storage/uploads/:projectId.%(ext)s" \
            --no-playlist \
            --newline \
            --no-warnings \
            <source_url>
     ```
   - Handle private/unavailable/age-restricted by inspecting exit code + stderr.
   - Find downloaded file (yt-dlp may produce `.mp4`, `.webm`, `.mkv`, etc.):
     ```js
     const uploadDir = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || './storage/uploads');
     const candidates = (await readdir(uploadDir)).filter(f => f.startsWith(projectId));
     ```
   - Probe downloaded file with ffprobe to get duration/width/height/fps/codec.
   - If duration > `MAX_VIDEO_DURATION_MINUTES * 60`, set FAILED with clear message.
   - Update project:
     - `source_file_path: relativePath`
     - `video_url: relativePath`
     - `file_size`
     - `storage_size`
     - `duration_seconds`
     - `width`, `height`, `fps`, `codec`
     - `status: 'UPLOADED'`
     - `stage: 'UPLOADED'`
     - `progress: 5`
     - `current_step: 'YouTube source downloaded. Configure the project to start processing.'`
   - Complete job.

### 5. Health check

Create `lib/system/ytdlp.mjs`:

```ts
export function getYtdlpPath(): string {
  const envPath = process.env.YTDLP_PATH;
  if (envPath) return envPath;
  // On Windows the binary is yt-dlp.exe; on Linux/macOS yt-dlp.
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

export function checkYtdlp() {
  const ytdlpPath = getYtdlpPath();
  const result = spawnSync(ytdlpPath, ['--version'], { encoding: 'utf8', windowsHide: true });
  return {
    ok: result.status === 0,
    path: ytdlpPath,
    version: result.stdout?.trim() || null,
    error: result.error?.message || result.stderr?.trim() || null,
  };
}
```

Update `lib/system/environmentValidator.mjs`:
- Add `const ytdlp = checkYtdlp();` and include in return object.
- If `!ytdlp.ok`, push error with install command.
- Add to `installCommands.mjs`:
  ```ts
  export function buildYtdlpInstallCommand() {
    return process.platform === 'win32'
      ? 'winget install yt-dlp'
      : 'python3 -m pip install -U yt-dlp';
  }
  ```

### 6. UI changes

Update `components/home/HeroCreateInput.tsx`:
- Detect YouTube URL first.
- If detected:
  - Show notice: "YouTube link detected. Preparing source video..."
  - POST to `/api/projects` with `{ videoUrl, sourceType: 'youtube' }`.
  - On success, redirect to configure page.
- Update helper text: "Direct video URLs, local uploads, and YouTube links supported."

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid YouTube URL | API returns 400 with code `INVALID_YOUTUBE_URL` |
| yt-dlp not installed | Health check fails; worker sets project FAILED with install command |
| Private/removed video | Worker parses stderr, sets FAILED with yt-dlp message |
| Age-restricted | Try download; if yt-dlp cannot bypass, set FAILED gracefully |
| Duration exceeds limit | After probe, set FAILED with duration info |
| Download network error | Worker retries (job max_attempts=3), then FAILED |
| yt-dlp returns non-MP4 | Accept any container, probe it; later FFmpeg can transcode |

## Status/Progress Mapping

Add to `lib/processing/status.ts`:
- `SOURCE_RESOLVING: 2`
- `DOWNLOADING_SOURCE: 4`
- `SOURCE_READY: 5`

After download the project moves to `UPLOADED: 5`, matching the upload flow.

## Acceptance Criteria Verification

1. Paste YouTube URL in Create page → project created with `source_type='youtube'`.
2. Worker downloads video to `storage/uploads/`.
3. Project status becomes `UPLOADED` with `source_file_path` populated.
4. User can configure and start → normal pipeline.
5. On failure, project status `FAILED` with clear `error_message`.
6. `/api/system/health` reports yt-dlp availability and version.
7. No heavy download in request thread.
8. No hardcoded paths; `YTDLP_PATH` env var supported.
