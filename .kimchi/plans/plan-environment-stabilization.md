# AutoClip AI — Environment Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize AutoClip AI's runtime environment on Windows PowerShell by enforcing a single `PYTHON_PATH`, validating dependencies before any processing job starts, adding CUDA-to-CPU fallback in transcription, and surfacing everything through a system health API and UI page.

**Architecture:**
- A shared `lib/system/environmentValidator.mjs` (Node ESM, usable by both Next.js API routes and the plain-Node worker) reads env vars, validates binary paths, runs `scripts/check_python_env.py`, and returns a typed JSON result.
- The worker calls `validateEnvironment()` once per job in `processJob()` before dispatching; failures mark the project `FAILED` with `current_step='ENVIRONMENT_CHECK'` and log user-friendly install commands.
- `scripts/transcribe_faster_whisper.py` retries on CUDA library errors with `device='cpu'`, `compute_type='int8'`.
- `GET /api/system/health` returns the validator result; `/settings/system-health` renders it and shows a copyable install command.

**Tech Stack:** Next.js 14 App Router, TypeScript, plain Node worker (`.mjs`), FFmpeg, Python 3.12, faster-whisper, MediaPipe, OpenCV, Windows PowerShell.

---

## Chunk 1 — Audit & Cleanup Hardcoded Paths

**Files changed:**
- Delete: `run_worker_wsl.sh`
- Delete: `run_worker_proj81c5.sh`
- Modify: `scripts/smoke_test_reframe.py`
- Verify: entire project for remaining hardcoded paths

- [ ] **Step 1.1: Delete WSL worker scripts**

Run:
```bash
git rm "run_worker_wsl.sh" "run_worker_proj81c5.sh"
```

These files hardcode `/mnt/d/.../.venv/bin/python` and are not used in the target Windows PowerShell environment. Removing them prevents accidental mixed-path usage.

- [ ] **Step 1.2: Refactor `scripts/smoke_test_reframe.py` to use `PYTHON_PATH`**

Modify the top of `scripts/smoke_test_reframe.py`:

```python
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PYTHON = Path(os.environ.get("PYTHON_PATH", "python"))
TRACK_SCRIPT = PROJECT_ROOT / "scripts" / "track_subject.py"
```

Replace the previous hardcoded `PYTHON = Path("C:/Users/USER/...")` line.

- [ ] **Step 1.3: Verify no hardcoded paths remain**

Run:
```bash
grep -Rin "Python312\\\\python.exe\|WindowsApps\\\\python.exe\|/mnt/d/.*\.venv/bin/python\|C:/Users/.*/AppData/Local/Programs/Python/Python312/python.exe" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.py" --include="*.sh" .
```

Expected: no matches except possibly inside `.env` (allowed) or this plan document.

- [ ] **Step 1.4: Commit**

```bash
git add run_worker_wsl.sh run_worker_proj81c5.sh scripts/smoke_test_reframe.py
# record the deletion and the refactor
git commit -m "chore(env): remove WSL scripts and hardcoded Python path in smoke test"
```

---

## Chunk 2 — Config Normalization

**Files changed:**
- Create: `lib/system/config.mjs`
- Create: `lib/system/config.d.ts`
- Modify: `.env.example`

- [ ] **Step 2.1: Create shared config loader `lib/system/config.mjs`**

```javascript
import { existsSync } from 'fs';
import path from 'path';

/**
 * Centralized, read-only access to environment-critical paths.
 * Throws early with a clear message if a required path is missing or invalid.
 */
export function getEnvPath(key, { required = true } = {}) {
  const raw = process.env[key];
  if (!raw) {
    if (required) throw new Error(`Environment variable ${key} is not set.`);
    return null;
  }
  // Normalize separators so Windows paths work in logs and comparisons.
  return raw.replace(/\\/g, '/');
}

export function getPythonPath() {
  const platform = process.platform;
  const pythonPath = getEnvPath('PYTHON_PATH', { required: true });

  if (platform === 'win32') {
    if (pythonPath.toLowerCase().includes('windowsapps')) {
      throw new Error(
        `PYTHON_PATH points to the WindowsApps alias (${pythonPath}). ` +
        'Use the full Windows path to python.exe, e.g. C:/Users/USER/AppData/Local/Programs/Python/Python312/python.exe'
      );
    }
    if (pythonPath.startsWith('/mnt/') || pythonPath.startsWith('/usr/') || pythonPath.includes('/.venv/bin/python')) {
      throw new Error(
        `PYTHON_PATH points to a WSL/Linux path while running on Windows (${pythonPath}). ` +
        'Use a Windows path such as C:/Users/USER/AppData/Local/Programs/Python/Python312/python.exe'
      );
    }
    if (!pythonPath.endsWith('.exe')) {
      throw new Error(
        `PYTHON_PATH on Windows must end with .exe (${pythonPath}).`
      );
    }
  }

  if (platform === 'linux') {
    if (/^[a-zA-Z]:/.test(pythonPath)) {
      throw new Error(
        `PYTHON_PATH points to a Windows path while running on Linux (${pythonPath}). ` +
        'Use a Linux path such as /usr/bin/python3 or /path/to/.venv/bin/python.'
      );
    }
  }

  if (!existsSync(pythonPath)) {
    throw new Error(`PYTHON_PATH does not exist: ${pythonPath}`);
  }

  return pythonPath;
}

export function getFfmpegPath() {
  const platform = process.platform;
  const ffmpegPath = getEnvPath('FFMPEG_PATH', { required: true });

  if (platform === 'win32' && (ffmpegPath.startsWith('/mnt/') || ffmpegPath.startsWith('/usr/'))) {
    throw new Error(`FFMPEG_PATH points to a Linux path while running on Windows (${ffmpegPath}).`);
  }
  if (platform === 'linux' && /^[a-zA-Z]:/.test(ffmpegPath)) {
    throw new Error(`FFMPEG_PATH points to a Windows path while running on Linux (${ffmpegPath}).`);
  }
  if (!existsSync(ffmpegPath)) {
    throw new Error(`FFMPEG_PATH does not exist: ${ffmpegPath}`);
  }
  return ffmpegPath;
}

export function getFfprobePath() {
  const platform = process.platform;
  const ffprobePath = getEnvPath('FFPROBE_PATH', { required: true });

  if (platform === 'win32' && (ffprobePath.startsWith('/mnt/') || ffprobePath.startsWith('/usr/'))) {
    throw new Error(`FFPROBE_PATH points to a Linux path while running on Windows (${ffprobePath}).`);
  }
  if (platform === 'linux' && /^[a-zA-Z]:/.test(ffprobePath)) {
    throw new Error(`FFPROBE_PATH points to a Windows path while running on Linux (${ffprobePath}).`);
  }
  if (!existsSync(ffprobePath)) {
    throw new Error(`FFPROBE_PATH does not exist: ${ffprobePath}`);
  }
  return ffprobePath;
}

export function getWhisperConfig() {
  return {
    engine: process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
    model: process.env.WHISPER_MODEL || 'small',
    device: process.env.WHISPER_DEVICE || 'cpu',
  };
}
```

- [ ] **Step 2.2: Add TypeScript declarations `lib/system/config.d.ts`**

```typescript
export function getEnvPath(key: string, options?: { required?: boolean }): string | null;
export function getPythonPath(): string;
export function getFfmpegPath(): string;
export function getFfprobePath(): string;
export function getWhisperConfig(): { engine: string; model: string; device: string };
```

- [ ] **Step 2.3: Update `.env.example` to Windows-safe defaults**

Replace the video-processing section in `.env.example` with:

```env
# Transcription
TRANSCRIBE_ENGINE=faster-whisper
WHISPER_MODEL=small
WHISPER_DEVICE=cpu

# Video Processing — Windows PowerShell defaults.
# On Linux/WSL, override these with Linux paths.
FFMPEG_PATH=C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe
FFPROBE_PATH=C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffprobe.exe
PYTHON_PATH=C:/Users/USER/AppData/Local/Programs/Python/Python312/python.exe
```

Keep the generic fallback values commented out if desired, but the active defaults must be the Windows paths above.

- [ ] **Step 2.4: Verify config loader loads `.env` correctly**

Run a quick Node test:
```bash
node -e "const { getPythonPath, getFfmpegPath, getFfprobePath } = require('./lib/system/config.mjs'); console.log(getPythonPath(), getFfmpegPath(), getFfprobePath());"
```

Expected: prints the three Windows paths from `.env` without throwing.

- [ ] **Step 2.5: Commit**

```bash
git add lib/system/config.mjs lib/system/config.d.ts .env.example
git commit -m "feat(env): centralized config loader and Windows-safe .env.example"
```

---

## Chunk 3 — Environment Validator

**Files changed:**
- Create: `scripts/check_python_env.py`
- Create: `lib/system/environmentValidator.mjs`
- Create: `lib/system/environmentValidator.d.ts`
- Create: `lib/system/installCommands.mjs`
- Create: `lib/system/installCommands.d.ts`
- Modify: `types/index.ts` (add `EnvironmentValidationResult` type)

- [ ] **Step 3.1: Create `scripts/check_python_env.py`**

```python
import argparse
import json
import sys


def check_package(name):
    try:
        __import__(name)
        return True
    except Exception:
        return False


def test_cuda():
    try:
        import torch
        if not torch.cuda.is_available():
            return {"available": False, "message": "PyTorch reports CUDA is not available."}
        return {"available": True, "message": f"CUDA available: {torch.cuda.get_device_name(0)}"}
    except Exception as exc:
        return {"available": False, "message": f"CUDA check failed: {exc}"}


def main():
    parser = argparse.ArgumentParser(description="Check AutoClip AI Python environment.")
    parser.add_argument("--test-cuda", action="store_true", help="Also test CUDA availability.")
    args = parser.parse_args()

    packages = {
        "faster_whisper": "faster_whisper",
        "cv2": "cv2",
        "mediapipe": "mediapipe",
        "numpy": "numpy",
    }

    result = {
        "ok": True,
        "python_executable": sys.executable,
        "python_version": ".".join(str(p) for p in sys.version_info[:3]),
        "packages": {key: check_package(module) for key, module in packages.items()},
        "cuda": {"requested": args.test_cuda, "available": False, "message": "Not tested."},
    }

    if args.test_cuda:
        result["cuda"] = {**result["cuda"], **test_cuda()}

    result["ok"] = all(result["packages"].values())

    if not result["ok"]:
        missing = [name for name, ok in result["packages"].items() if not ok]
        result["error"] = f"Missing Python packages: {', '.join(missing)}"
        result["missing_packages"] = missing

    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3.2: Create install command helper `lib/system/installCommands.mjs`**

```javascript
/**
 * Build the exact pip install command for the configured Python interpreter.
 */
export function buildInstallCommand(missingPackages, pythonPath) {
  const groups = {
    faster_whisper: ['faster-whisper', 'ctranslate2'],
    cv2: ['opencv-python'],
    mediapipe: ['mediapipe'],
    numpy: ['numpy'],
  };

  const extras = new Set();
  for (const pkg of missingPackages) {
    if (groups[pkg]) {
      for (const dep of groups[pkg]) extras.add(dep);
    }
  }

  if (extras.size === 0) return null;

  const deps = Array.from(extras).sort();
  return `${pythonPath} -m pip install ${deps.join(' ')}`;
}

export function buildFullInstallCommand(pythonPath) {
  const deps = ['faster-whisper', 'ctranslate2', 'mediapipe', 'opencv-python', 'numpy', 'pillow', 'ultralytics'];
  return `${pythonPath} -m pip install ${deps.join(' ')}`;
}
```

- [ ] **Step 3.3: Create TypeScript declaration `lib/system/installCommands.d.ts`**

```typescript
export function buildInstallCommand(missingPackages: string[], pythonPath: string): string | null;
export function buildFullInstallCommand(pythonPath: string): string;
```

- [ ] **Step 3.4: Create `lib/system/environmentValidator.mjs`**

```javascript
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath, getPythonPath, getWhisperConfig } from './config.mjs';
import { buildInstallCommand, buildFullInstallCommand } from './installCommands.mjs';

function runVersion(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  return {
    ok: result.status === 0,
    version: (result.stdout || result.stderr || '').split(/\r?\n/)[0].trim() || null,
  };
}

function runPythonCheck(pythonPath, testCuda = false) {
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'check_python_env.py');
  const args = [scriptPath];
  if (testCuda) args.push('--test-cuda');

  const result = spawnSync(pythonPath, args, {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch {
    parsed = { ok: false, error: 'Invalid JSON from check_python_env.py' };
  }

  return {
    ok: result.status === 0 && parsed.ok === true,
    stdout: result.stdout,
    stderr: result.stderr,
    parsed,
  };
}

export async function validateEnvironment() {
  const warnings = [];
  const errors = [];

  let ffmpegPath = null;
  let ffprobePath = null;
  let pythonPath = null;

  // Path resolution + existence.
  try {
    ffmpegPath = getFfmpegPath();
  } catch (error) {
    errors.push(error.message);
  }

  try {
    ffprobePath = getFfprobePath();
  } catch (error) {
    errors.push(error.message);
  }

  try {
    pythonPath = getPythonPath();
  } catch (error) {
    errors.push(error.message);
  }

  const ffmpeg = { ok: false, path: ffmpegPath, version: null };
  const ffprobe = { ok: false, path: ffprobePath, version: null };
  const python = { ok: false, path: pythonPath, version: null };

  if (ffmpegPath) {
    const v = runVersion(ffmpegPath, ['-version']);
    ffmpeg.ok = v.ok;
    ffmpeg.version = v.version;
    if (!v.ok) errors.push(`FFmpeg could not run at ${ffmpegPath}`);
  }

  if (ffprobePath) {
    const v = runVersion(ffprobePath, ['-version']);
    ffprobe.ok = v.ok;
    ffprobe.version = v.version;
    if (!v.ok) errors.push(`FFprobe could not run at ${ffprobePath}`);
  }

  if (pythonPath) {
    const v = runVersion(pythonPath, ['--version']);
    python.ok = v.ok;
    python.version = v.version;
    if (!v.ok) errors.push(`Python could not run at ${pythonPath}`);
  }

  const whisperConfig = getWhisperConfig();
  const requestedCuda = whisperConfig.device === 'cuda';

  let packages = {
    faster_whisper: false,
    cv2: false,
    mediapipe: false,
    numpy: false,
  };
  let cuda = {
    requested: requestedCuda,
    available: false,
    fallbackToCpu: false,
    message: 'Using CPU mode',
  };
  let installCommand = null;

  if (python.ok && pythonPath) {
    const check = runPythonCheck(pythonPath, requestedCuda);
    if (check.ok && check.parsed) {
      packages = { ...packages, ...(check.parsed.packages || {}) };
      if (requestedCuda && check.parsed.cuda) {
        cuda.available = check.parsed.cuda.available;
        cuda.message = check.parsed.cuda.message;
        if (!cuda.available) {
          cuda.fallbackToCpu = true;
          warnings.push(
            `CUDA requested but not available: ${check.parsed.cuda.message}. Falling back to CPU mode.`
          );
        }
      }
    } else {
      const missing = check.parsed?.missing_packages || [];
      if (missing.length > 0) {
        errors.push(
          `Python environment is missing packages: ${missing.join(', ')}.`
        );
        installCommand = buildInstallCommand(missing, pythonPath);
      } else {
        errors.push(
          `Python environment check failed: ${check.parsed?.error || check.stderr || 'unknown error'}`
        );
      }
    }
  }

  if (!installCommand && errors.some(e => e.includes('Python environment'))) {
    installCommand = buildFullInstallCommand(pythonPath);
  }

  if (requestedCuda && !cuda.fallbackToCpu && !cuda.available) {
    // Safety net: if CUDA requested but we could not verify it, fall back.
    cuda.fallbackToCpu = true;
    warnings.push('CUDA status could not be verified. Using CPU mode to be safe.');
  }

  const ok = errors.length === 0;

  return {
    ok,
    ffmpeg,
    ffprobe,
    python,
    packages,
    cuda,
    warnings,
    errors,
    installCommand,
    paths: {
      ffmpeg: ffmpegPath,
      ffprobe: ffprobePath,
      python: pythonPath,
    },
    whisper: whisperConfig,
  };
}
```

- [ ] **Step 3.5: Create TypeScript declaration `lib/system/environmentValidator.d.ts`**

```typescript
export interface EnvironmentValidationResult {
  ok: boolean;
  ffmpeg: { ok: boolean; path: string | null; version: string | null };
  ffprobe: { ok: boolean; path: string | null; version: string | null };
  python: { ok: boolean; path: string | null; version: string | null };
  packages: {
    faster_whisper: boolean;
    cv2: boolean;
    mediapipe: boolean;
    numpy: boolean;
  };
  cuda: {
    requested: boolean;
    available: boolean;
    fallbackToCpu: boolean;
    message: string;
  };
  warnings: string[];
  errors: string[];
  installCommand: string | null;
  paths: { ffmpeg: string | null; ffprobe: string | null; python: string | null };
  whisper: { engine: string; model: string; device: string };
}

export function validateEnvironment(): Promise<EnvironmentValidationResult>;
```

- [ ] **Step 3.6: Add `EnvironmentValidationResult` to `types/index.ts`**

Append to `types/index.ts`:

```typescript
export interface EnvironmentValidationResult {
  ok: boolean;
  ffmpeg: { ok: boolean; path: string | null; version: string | null };
  ffprobe: { ok: boolean; path: string | null; version: string | null };
  python: { ok: boolean; path: string | null; version: string | null };
  packages: {
    faster_whisper: boolean;
    cv2: boolean;
    mediapipe: boolean;
    numpy: boolean;
  };
  cuda: { requested: boolean; available: boolean; fallbackToCpu: boolean; message: string };
  warnings: string[];
  errors: string[];
  installCommand: string | null;
  paths: { ffmpeg: string | null; ffprobe: string | null; python: string | null };
  whisper: { engine: string; model: string; device: string };
}
```

- [ ] **Step 3.7: Smoke-test the validator from Node**

Run:
```bash
node -e "import('./lib/system/environmentValidator.mjs').then(m => m.validateEnvironment().then(r => console.log(JSON.stringify(r, null, 2))))"
```

Expected: returns JSON matching the required shape; `ok` reflects the actual machine state.

- [ ] **Step 3.8: Commit**

```bash
git add scripts/check_python_env.py lib/system/environmentValidator.mjs lib/system/environmentValidator.d.ts lib/system/installCommands.mjs lib/system/installCommands.d.ts types/index.ts
git commit -m "feat(env): environment validator with Python dependency and CUDA checks"
```

---

## Chunk 4 — Worker Precheck

**Files changed:**
- Modify: `workers/processVideoWorker.mjs`

- [ ] **Step 4.1: Import the validator at the top of the worker**

After the existing imports in `workers/processVideoWorker.mjs`, add:

```javascript
import { validateEnvironment } from '../lib/system/environmentValidator.mjs';
```

- [ ] **Step 4.2: Add a helper to fail a job immediately without retries**

Before `processJob`, add:

```javascript
async function failJobImmediately(job, error) {
  await db.execute({
    sql: `UPDATE processing_jobs
          SET status = 'FAILED', error_message = ?, updated_at = ?
          WHERE job_id = ?`,
    args: [error.message, now(), job.job_id],
  });

  await updateProject(job.project_id, {
    status: 'FAILED',
    stage: 'FAILED',
    progress: 0,
    current_step: 'ENVIRONMENT_CHECK',
    error_message: error.message,
  });

  await log(job.project_id, job.job_id, 'ENVIRONMENT_CHECK', error.message, 'error');
}
```

- [ ] **Step 4.3: Run environment validation inside `processJob` before dispatching**

Inside `processJob`, immediately after the CANCELED guard and before the `switch`, add:

```javascript
  // Environment validation: fail early before any heavy work.
  try {
    const envCheck = await validateEnvironment();
    if (!envCheck.ok) {
      const friendly = envCheck.errors.join('\n');
      const command = envCheck.installCommand
        ? `\n\nInstall command:\n${envCheck.installCommand}\n\nOr open Settings → System Health.`
        : '';
      const message = `Python environment belum lengkap atau path tidak valid.\n${friendly}${command}`;
      await failJobImmediately(job, new Error(message));
      return;
    }

    for (const warning of envCheck.warnings) {
      await log(job.project_id, job.job_id, 'ENVIRONMENT_CHECK', warning, 'warn');
    }
  } catch (validationError) {
    const message = validationError instanceof Error
      ? validationError.message
      : 'Environment validation failed unexpectedly.';
    await failJobImmediately(job, new Error(`Environment check error: ${message}`));
    return;
  }
```

- [ ] **Step 4.4: Update worker imports to use centralized config helpers**

Replace:
```javascript
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
```

With:
```javascript
import { getFfmpegPath, getFfprobePath, getPythonPath } from '../lib/system/config.mjs';

const ffmpegPath = getFfmpegPath();
const ffprobePath = getFfprobePath();
```

Then replace the two occurrences of `process.env.PYTHON_PATH || 'python'` in `transcribeAudio` and `trackSubject` with `getPythonPath()`.

- [ ] **Step 4.5: Verify the worker still starts**

Run:
```bash
npm run worker:once
```

Expected: worker starts and, if no queued job exists, exits cleanly. If a job exists and environment is invalid, it marks the project FAILED with `current_step='ENVIRONMENT_CHECK'`.

- [ ] **Step 4.6: Commit**

```bash
git add workers/processVideoWorker.mjs
git commit -m "feat(worker): environment precheck before processing with fail-early behavior"
```

---

## Chunk 5 — Transcription Fallback

**Files changed:**
- Modify: `scripts/transcribe_faster_whisper.py`
- Modify: `workers/processVideoWorker.mjs` (log fallback warnings from stderr)

- [ ] **Step 5.1: Add CUDA error detection and retry logic in the Python script**

Rewrite `scripts/transcribe_faster_whisper.py` as follows:

```python
import argparse
import json
import os
import site
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

if os.name == "nt" and hasattr(os, "add_dll_directory"):
    for base in site.getsitepackages() + [site.getusersitepackages()]:
        nvidia_root = os.path.join(base, "nvidia")
        for rel in (
            os.path.join("cublas", "bin"),
            os.path.join("cudnn", "bin"),
            os.path.join("cuda_nvrtc", "bin"),
        ):
            dll_dir = os.path.join(nvidia_root, rel)
            if os.path.isdir(dll_dir):
                os.add_dll_directory(dll_dir)


def is_cuda_library_error(exc):
    msg = str(exc).lower()
    return any(keyword in msg for keyword in ["cublas", "cudnn", "cuda", "no cuda", "cuda runtime"])


def transcribe_with_model(model, audio_path, language, vad_params):
    segments_iter, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        word_timestamps=False,
        condition_on_previous_text=False,
        beam_size=5,
        vad_parameters=vad_params,
    )

    segments = []
    words = []
    full_text_parts = []

    for segment in segments_iter:
        segment_words = []
        for word in segment.words or []:
            item = {
                "word": word.word.strip(),
                "start": round(float(word.start), 3),
                "end": round(float(word.end), 3),
            }
            words.append(item)
            segment_words.append(item)

        text = segment.text.strip()
        full_text_parts.append(text)
        segments.append(
            {
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "text": text,
                "words": segment_words,
            }
        )

    return {
        "language": getattr(info, "language", language),
        "languageProbability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "fullText": " ".join(full_text_parts).strip(),
        "segments": segments,
        "words": words,
    }


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper and return JSON.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default=None)
    parser.add_argument("--language", default="auto")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error": (
                        "Python package faster-whisper is not installed. "
                        "Install it with the command shown in Settings → System Health."
                    ),
                    "details": str(exc),
                }
            ),
            file=sys.stderr,
        )
        return 2

    device = args.device
    compute_type = args.compute_type or ("int8_float16" if device == "cuda" else "int8")
    language = None if args.language == "auto" else args.language

    vad_params = {
        "min_silence_duration_ms": 500,
        "speech_pad_ms": 200,
    }

    try:
        model = WhisperModel(args.model, device=device, compute_type=compute_type)
        result = transcribe_with_model(model, args.audio, language, vad_params)
    except RuntimeError as exc:
        if device == "cuda" and is_cuda_library_error(exc):
            warning = {
                "warning": "CUDA transcription failed. Falling back to CPU.",
                "details": str(exc),
                "recommendation": "Set WHISPER_DEVICE=cpu to avoid CUDA initialization.",
            }
            print(json.dumps(warning), file=sys.stderr)
            try:
                model = WhisperModel(args.model, device="cpu", compute_type="int8")
                result = transcribe_with_model(model, args.audio, language, vad_params)
                result["fallback"] = "cpu"
            except Exception as cpu_exc:
                print(
                    json.dumps({"error": f"CPU fallback also failed: {cpu_exc}"}),
                    file=sys.stderr,
                )
                return 1
        else:
            print(json.dumps({"error": str(exc)}), file=sys.stderr)
            return 1
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5.2: Update worker `transcribeAudio` to pass `--compute-type` and log fallback warnings**

In `workers/processVideoWorker.mjs`, update `transcribeAudio`:

```javascript
async function transcribeAudio(audioRelativePath, project) {
  const audioPath = resolveWorkspacePath(audioRelativePath);
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'transcribe_faster_whisper.py');
  const pythonPath = getPythonPath();
  const whisperDevice = process.env.WHISPER_DEVICE || 'cpu';
  const computeType = whisperDevice === 'cuda' ? 'int8_float16' : 'int8';

  const { stdout, stderr } = await runCommand(pythonPath, [
    scriptPath,
    '--audio', audioPath,
    '--model', process.env.WHISPER_MODEL || 'small',
    '--device', whisperDevice,
    '--compute-type', computeType,
    '--language', project.language || 'auto',
  ]);

  // Surface fallback warnings to processing logs.
  if (stderr) {
    try {
      const lines = stderr.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed.warning) {
          await log(project.project_id, null, 'TRANSCRIBING', parsed.warning, 'warn', {
            details: parsed.details,
            recommendation: parsed.recommendation,
          });
        }
      }
    } catch {
      // Non-JSON stderr; ignore.
    }
  }

  return JSON.parse(stdout);
}
```

- [ ] **Step 5.3: Test CUDA fallback manually (if CUDA is unavailable)**

Temporarily set `WHISPER_DEVICE=cuda` and run:
```bash
$env:WHISPER_DEVICE="cuda"; npm run worker:once
```

Queue a short project first (or use an existing queued job). Expected: transcription logs a CUDA fallback warning and completes successfully on CPU.

- [ ] **Step 5.4: Commit**

```bash
git add scripts/transcribe_faster_whisper.py workers/processVideoWorker.mjs
git commit -m "feat(transcribe): CUDA-to-CPU fallback and compute_type selection"
```

---

## Chunk 6 — Health Check API & UI

**Files changed:**
- Delete: `app/api/settings/system-health/route.ts`
- Delete: `app/settings/page.tsx`
- Create: `app/api/system/health/route.ts`
- Create: `app/settings/system-health/page.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/MobileSidebarDrawer.tsx`

- [ ] **Step 6.1: Delete old health endpoint and settings page**

Run:
```bash
git rm app/api/settings/system-health/route.ts
git rm app/settings/page.tsx
```

- [ ] **Step 6.2: Create new `GET /api/system/health` endpoint**

Create `app/api/system/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/system/environmentValidator.mjs';

export async function GET() {
  const result = await validateEnvironment();
  return NextResponse.json({ data: result });
}
```

- [ ] **Step 6.3: Create `/settings/system-health` page**

Create `app/settings/system-health/page.tsx`:

```tsx
import AppShell from '@/components/layout/AppShell';
import Badge from '@/components/ui/Badge';
import { validateEnvironment } from '@/lib/system/environmentValidator.mjs';
import {
  Terminal,
  Activity,
  Video,
  Cpu,
  Microchip,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { EnvironmentValidationResult } from '@/types';

function StatusRow({
  label,
  description,
  ok,
}: {
  label: string;
  description: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div>
        <div className="text-sm font-medium text-primary">{label}</div>
        <div className="text-xs text-secondary mt-0.5">{description}</div>
      </div>
      <Badge variant={ok ? 'success' : 'alert'}>{ok ? 'OK' : 'Failed'}</Badge>
    </div>
  );
}

function PackageRow({
  label,
  installed,
}: {
  label: string;
  installed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div className="text-sm font-medium text-primary">{label}</div>
      <Badge variant={installed ? 'success' : 'alert'}>
        {installed ? 'Installed' : 'Missing'}
      </Badge>
    </div>
  );
}

export default async function SystemHealthPage() {
  const env = (await validateEnvironment()) as EnvironmentValidationResult;

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">System Health</h1>
            <p className="text-sm text-secondary">
              Environment validation for FFmpeg, Python, and AI dependencies.
            </p>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Video Processing</h2>
                <p className="text-sm text-secondary">FFmpeg, FFprobe, and Python paths</p>
              </div>
            </div>
            <div className="space-y-1">
              <StatusRow label="FFmpeg" description={env.ffmpeg.version || env.ffmpeg.path || 'Not configured'} ok={env.ffmpeg.ok} />
              <StatusRow label="FFprobe" description={env.ffprobe.version || env.ffprobe.path || 'Not configured'} ok={env.ffprobe.ok} />
              <StatusRow label="Python" description={env.python.version || env.python.path || 'Not configured'} ok={env.python.ok} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Python Packages</h2>
                <p className="text-sm text-secondary">Packages required for transcription and reframe</p>
              </div>
            </div>
            <div className="space-y-1">
              <PackageRow label="faster-whisper" installed={env.packages.faster_whisper} />
              <PackageRow label="OpenCV (cv2)" installed={env.packages.cv2} />
              <PackageRow label="MediaPipe" installed={env.packages.mediapipe} />
              <PackageRow label="NumPy" installed={env.packages.numpy} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-energy/10 flex items-center justify-center">
                <Microchip className="w-5 h-5 text-energy" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Transcription Engine</h2>
                <p className="text-sm text-secondary">Current configuration</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">Engine</div>
                <div className="text-sm text-secondary font-mono">{env.whisper.engine}</div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">Model</div>
                <div className="text-sm text-secondary font-mono">{env.whisper.model}</div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">Device</div>
                <div className="text-sm text-secondary font-mono">{env.whisper.device}</div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">CUDA</div>
                <div className="text-sm text-secondary font-mono">
                  {env.cuda.requested ? 'Requested' : 'Not requested'}
                  {' / '}
                  {env.cuda.available ? 'Available' : 'Unavailable'}
                  {env.cuda.fallbackToCpu && ' (fallback CPU)'}
                </div>
              </div>
            </div>
          </div>

          {env.warnings.length > 0 && (
            <div className="card p-6 bg-energy/5 border-energy/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-energy" />
                <h3 className="text-sm font-semibold text-primary">Warnings</h3>
              </div>
              <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
                {env.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {env.errors.length > 0 && (
            <div className="card p-6 bg-alert/5 border-alert/20">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-5 h-5 text-alert" />
                <h3 className="text-sm font-semibold text-primary">Errors</h3>
              </div>
              <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
                {env.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {env.installCommand && (
            <div className="card p-6 bg-accent/5 border-accent/20">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-5 h-5 text-accent" />
                <h3 className="text-sm font-semibold text-primary">Recommended Fix</h3>
              </div>
              <p className="text-sm text-secondary mb-2">
                Run this command in PowerShell to install missing packages:
              </p>
              <pre className="bg-sidebar p-3 rounded text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap">
                {env.installCommand}
              </pre>
            </div>
          )}

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-success" />
              <h3 className="text-sm font-semibold text-primary">Overall Status</h3>
            </div>
            <div className="flex items-center gap-2">
              {env.ok ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <span className="text-sm text-secondary">Environment is ready for processing.</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-alert" />
                  <span className="text-sm text-secondary">Environment has issues that must be fixed before processing.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 6.4: Update sidebar links**

In both `components/layout/Sidebar.tsx` and `components/layout/MobileSidebarDrawer.tsx`, change:
```typescript
{ name: 'Settings', href: '/settings', icon: Settings },
```
to:
```typescript
{ name: 'Settings', href: '/settings/system-health', icon: Settings },
```

- [ ] **Step 6.5: Verify health endpoint and page**

Run dev server:
```bash
npm run dev
```

In another terminal:
```bash
curl http://localhost:3000/api/system/health
```

Expected: JSON matching `EnvironmentValidationResult` shape.

Open `http://localhost:3000/settings/system-health` in the browser. Expected: page shows all status rows and install command if any package is missing.

- [ ] **Step 6.6: Commit**

```bash
git add app/api/system/health/route.ts app/settings/system-health/page.tsx components/layout/Sidebar.tsx components/layout/MobileSidebarDrawer.tsx
git commit -m "feat(health): /api/system/health endpoint and /settings/system-health page"
```

---

## Chunk 7 — End-to-End Test

**Files changed:**
- None (verification only).

Prerequisites: `.env` already contains the Windows paths from the task description:
```env
FFMPEG_PATH=C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe
FFPROBE_PATH=C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffprobe.exe
PYTHON_PATH=C:/Users/USER/AppData/Local/Programs/Python/Python312/python.exe
WHISPER_DEVICE=cpu
```

- [ ] **Step 7.1: Confirm environment is valid via health endpoint**

Run:
```bash
curl http://localhost:3000/api/system/health | python -m json.tool
```

Expected:
- `ok: true`
- `ffmpeg.ok`, `ffprobe.ok`, `python.ok` are `true`
- `packages.faster_whisper`, `packages.cv2`, `packages.mediapipe`, `packages.numpy` are `true`
- `cuda.requested: false` and `cuda.fallbackToCpu: true`

If any check is false, run the displayed install command and retest.

- [ ] **Step 7.2: Upload a short test video**

Place a short test video (e.g., `test_video.mp4`, 5–15 seconds, with clear audio) in the project root, then use curl:

```bash
curl -X POST -F "file=@test_video.mp4" -F "title=Environment Test" http://localhost:3000/api/uploads/video
```

Expected: response with `projectId` and `status: 'UPLOADED'`.

- [ ] **Step 7.3: Start the project**

Use the returned `projectId`:
```bash
curl -X POST http://localhost:3000/api/projects/{projectId}/start
```

Expected: response with `status: 'QUEUED'`.

- [ ] **Step 7.4: Run the worker**

```bash
npm run worker:once
```

Expected behavior:
- Worker passes environment check.
- Project progresses through PROBING → EXTRACTING_AUDIO → TRANSCRIBING → ANALYZING → PLANNING_CLIPS → RENDERING → COMPLETED.
- No `ENVIRONMENT_CHECK` failure.
- If a CUDA fallback warning appears, transcription still completes on CPU.
- At least one clip is rendered and visible in the database.

- [ ] **Step 7.5: Verify clip output**

Query the database:
```bash
node -e "const { createClient } = require('@libsql/client'); const db = createClient({ url: 'file:local.db' }); db.execute('SELECT clip_id, status, output_file_path FROM clips WHERE project_id = (SELECT project_id FROM projects ORDER BY created_at DESC LIMIT 1)').then(r => console.log(JSON.stringify(r.rows, null, 2))).catch(console.error);"
```

Expected: rows with `status: 'COMPLETED'` and non-null `output_file_path`.

- [ ] **Step 7.6: Run build/lint checks**

```bash
npm run lint
npm run build
```

Expected: `lint` passes with no new errors; `build` succeeds.

- [ ] **Step 7.7: Final commit**

If any fixes were required during end-to-end testing, commit them with a descriptive message.

---

## Verification Strategy

| Check | How |
|-------|-----|
| No hardcoded Python paths | `grep` for `Python312`, `WindowsApps`, `/mnt/d/.*.venv` returns no matches |
| All Python calls use `PYTHON_PATH` | `grep PYTHON_PATH` shows `getPythonPath()` usage in worker and reframe pipeline; no bare `python` |
| Worker rejects WSL path on Windows | Temporarily set `PYTHON_PATH=/mnt/d/.../.venv/bin/python`; `npm run worker:once` fails with clear error |
| Worker rejects WindowsApps alias | Temporarily set `PYTHON_PATH=.../WindowsApps/python.exe`; worker fails with clear error |
| Health endpoint checks all dependencies | `curl /api/system/health` returns full JSON with ffmpeg, ffprobe, python, packages, cuda |
| Install command shown when package missing | Remove one package from Python env (or stub `check_python_env.py`); health page shows correct install command |
| CUDA fallback works | Set `WHISPER_DEVICE=cuda`; worker falls back to CPU and completes |
| Job fails early on invalid env | Stop Python env (rename python.exe or unset PYTHON_PATH); enqueue job; project becomes `FAILED` with `current_step='ENVIRONMENT_CHECK'` |
| End-to-end CPU pipeline works | Upload + start + `worker:once` completes with rendered clip |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `.mjs` validator cannot be imported by Next.js `.ts` routes | Provide `.d.ts`; Next.js App Router supports `.mjs` imports. Smoke-test `/api/system/health` before moving on. |
| Worker is `.mjs` but imports relative path `./lib/system/...` | Place validator in `lib/system/` and import with relative path from `workers/processVideoWorker.mjs`. |
| CUDA fallback still fails due to other errors | Catch generic exceptions after CPU retry and surface as user-friendly failure. |
| Existing UI depends on `/settings` route | Update Sidebar + MobileSidebarDrawer links; add redirect from `/settings` to `/settings/system-health` if needed (Step 6.3 page can be the only entry point). |
| Health page is server-rendered and runs heavy probes | The validator runs subprocesses; acceptable for an admin settings page. Cache is not required for MVP. |

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Validator written as `.mjs` + `.d.ts` instead of `.ts` | Must be importable by the plain-Node worker without tsx/ts-node. |
| D2 | Use `lib/system/` path instead of user's `src/lib/system/` | Project tsconfig maps `@/*` to root; existing code lives under `lib/`, not `src/lib/`. |
| D3 | Delete WSL shell scripts instead of updating them | Target environment is Windows PowerShell; WSL scripts with `/mnt/d/.../.venv` are actively harmful. |
| D4 | Worker environment failure uses `failJobImmediately` | Environment errors do not benefit from retries; retrying wastes queue attempts. |
| D5 | Health endpoint replaces existing `/api/settings/system-health` | User explicitly requested `/api/system/health` and `/settings/system-health`. |
| D6 | `.env.example` defaults to Windows paths | Project is currently developed on Windows PowerShell; Linux users can override. |
| D7 | `current_step='ENVIRONMENT_CHECK'` while `status='FAILED'` | Matches user requirement; keeps ProjectStatus union unchanged. |
