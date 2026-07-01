import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { getFfmpegPath, getFfprobePath, getPythonPath, getWhisperConfig } from './config.mjs';
import { buildInstallCommand, buildFullInstallCommand, buildYtdlpInstallCommand } from './installCommands.mjs';
import { checkYtdlp } from './ytdlp.mjs';

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

  const ytdlp = checkYtdlp();
  if (!ytdlp.ok) {
    errors.push(`yt-dlp is not available at ${ytdlp.path}: ${ytdlp.error || 'unknown error'}`);
    if (!installCommand) {
      installCommand = buildYtdlpInstallCommand();
    }
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
    ytdlp,
    packages,
    cuda,
    warnings,
    errors,
    installCommand,
    paths: {
      ffmpeg: ffmpegPath,
      ffprobe: ffprobePath,
      python: pythonPath,
      ytdlp: ytdlp.path,
    },
    whisper: whisperConfig,
  };
}
