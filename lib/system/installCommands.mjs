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

/**
 * Build a platform-appropriate yt-dlp install command.
 */
export function buildYtdlpInstallCommand() {
  return process.platform === 'win32'
    ? 'winget install yt-dlp'
    : 'python3 -m pip install -U yt-dlp';
}
