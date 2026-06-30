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
