# Review: Chunks 1-6 — Environment Stabilization

## Verdict: NEEDS_FIXES

The core implementation matches the plan and the changed files compile/type-check, but two categories of fixes are needed before the environment stabilization is complete:

1. Two existing callers still use bare `process.env.*` fallbacks instead of the new config helpers, so invalid paths are silently ignored there.
2. The worker now evaluates `getFfmpegPath()`/`getFfprobePath()` at module load, which causes the process to crash on startup for invalid paths instead of letting the per-job precheck fail gracefully with `current_step='ENVIRONMENT_CHECK'`.

---

## Issues

### 1. Remaining bare `process.env.FFMPEG_PATH` usage in frame sampler

- **File:** `/mnt/d/Krisna Taufik/Project Krisna/AiClipper/lib/video/reframe/sampleFrames.ts`
- **Line:** 23
- **Problem:** The function falls back to the bare command `ffmpeg` when `FFMPEG_PATH` is unset, bypassing the centralized path validation and Windows/Linux path checks in `lib/system/config.mjs`.
  ```ts
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  ```
- **Suggested fix:** Import `getFfmpegPath` from `@/lib/system/config.mjs` and replace the line with:
  ```ts
  const ffmpegPath = getFfmpegPath();
  ```

### 2. Remaining bare `process.env.PYTHON_PATH` usage in reframe analyzer

- **File:** `/mnt/d/Krisna Taufik/Project Krisna/AiClipper/lib/video/reframe/reframePipeline.ts`
- **Line:** 34
- **Problem:** The reframe pipeline uses a bare `python` fallback, so it will not respect `PYTHON_PATH` validation and will break on Windows PowerShell when only the configured interpreter should be used.
  ```ts
  const pythonPath = process.env.PYTHON_PATH || 'python';
  ```
- **Suggested fix:** Import `getPythonPath` from `@/lib/system/config.mjs` and replace the line with:
  ```ts
  const pythonPath = getPythonPath();
  ```

### 3. Worker evaluates FFmpeg/FFprobe paths at module load

- **File:** `/mnt/d/Krisna Taufik/Project Krisna/AiClipper/workers/processVideoWorker.mjs`
- **Lines:** 35-36
- **Problem:** After the refactor, the worker calls the throwing helpers at the top level:
  ```js
  const ffmpegPath = getFfmpegPath();
  const ffprobePath = getFfprobePath();
  ```
  If either path is missing or points to the wrong platform, the worker process exits on startup. The plan's end-to-end verification expects an invalid environment to be caught inside `processJob` and reported as a project failure with `current_step='ENVIRONMENT_CHECK'`, not as a worker crash.
- **Suggested fix:** Resolve the paths lazily inside the functions that use them (`probeVideo`, `extractAudio`, `renderClip`, etc.) or wrap the top-level calls in `try/catch` and defer the hard failure until the per-job environment precheck runs. Keep the precheck in `processJob` intact.

---

## What was verified

- **Syntax:** All reviewed `.mjs` files pass `node --check`. All reviewed Python scripts pass `python3 -m py_compile`.
- **Types:** `npx tsc --noEmit` completed with no errors.
- **Build:** `npm run build` compiled successfully and generated all static pages. It failed only at the final filesystem copy with `EPERM` while copying `_not-found.html` to `pages/404.html`, which is an environment/permission issue, not a code issue.
- **Lint:** `npm run lint` could not run because the repository has no ESLint configuration and Next.js prompts interactively. A project ESLint config should be added before relying on this script.
- **Integration checks:**
  - `workers/processVideoWorker.mjs` imports `validateEnvironment`, `getFfmpegPath`, `getFfprobePath`, and `getPythonPath` from the new `lib/system` modules.
  - `failJobImmediately` correctly sets `current_step: 'ENVIRONMENT_CHECK'`.
  - `app/api/system/health/route.ts` imports `validateEnvironment` from `@/lib/system/environmentValidator.mjs`.
  - `app/settings/system-health/page.tsx` imports `EnvironmentValidationResult` from `@/types` and renders with `AppShell`/`Badge`.
  - `scripts/transcribe_faster_whisper.py` implements CUDA keyword detection and CPU fallback with `compute_type='int8'`.
  - Sidebar and mobile drawer links point to `/settings/system-health`.
  - `types/index.ts` exports `EnvironmentValidationResult` matching the validator shape.
  - `.env.example` contains the Windows-safe defaults from the plan.
