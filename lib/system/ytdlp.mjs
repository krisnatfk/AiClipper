import { spawnSync } from 'child_process';

/**
 * Get the yt-dlp executable path.
 * Uses the YTDLP_PATH environment variable if set, otherwise falls back to
 * the platform default (yt-dlp.exe on Windows, yt-dlp elsewhere).
 */
export function getYtdlpPath() {
  const envPath = process.env.YTDLP_PATH;
  if (envPath) return envPath;
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

/**
 * Check whether yt-dlp is available and what version it reports.
 */
export function checkYtdlp() {
  const ytdlpPath = getYtdlpPath();
  const result = spawnSync(ytdlpPath, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    path: ytdlpPath,
    version: result.stdout?.trim() || null,
    error: result.error?.message || result.stderr?.trim() || null,
  };
}
