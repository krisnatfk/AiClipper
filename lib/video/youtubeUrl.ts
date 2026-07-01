/**
 * YouTube URL parsing helpers.
 * Supports youtu.be short links, youtube.com/watch?v=..., and
 * youtube.com/shorts/...
 */

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/')[2] || null;
      }
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
