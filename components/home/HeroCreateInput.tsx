'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { isYouTubeUrl } from '@/lib/video/youtubeUrl';
import { Link as LinkIcon, Upload, Sparkles, Cloud, AlertCircle } from 'lucide-react';

/**
 * Hero create input (spec Section B / decision D1).
 *
 * Draft-first flow: this component ONLY submits the video (file upload or
 * direct URL). It does NOT configure or start processing — after a successful
 * submit it redirects to /projects/:id/configure, where the user sets all the
 * clipping options before clicking "Get clips in 1 click" (which hits
 * /api/projects/:id/start). YouTube/TikTok URLs surface a clear "coming soon"
 * message instead of crashing.
 */
const PLATFORM_PATTERNS = [
  /(?:^|\.)(youtube\.com|youtu\.be)$/i,
  /(?:^|\.)(tiktok\.com)$/i,
  /(?:^|\.)(instagram\.com)$/i,
  /(?:^|\.)(facebook\.com|fb\.watch)$/i,
  /(?:^|\.)(vimeo\.com)$/i,
  /(?:^|\.)(twitter\.com|x\.com)$/i,
];

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const pattern of PLATFORM_PATTERNS) {
      if (pattern.test(host)) return host;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function isDirectVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return /\.(mp4|mov|m4v|webm|mkv)(\?.*)?$/i.test(parsed.pathname + parsed.search);
  } catch {
    return false;
  }
}

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
const ACCEPTED_EXT = '.mp4,.mov,.webm,.mkv';

export default function HeroCreateInput() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!videoFile && !videoUrl.trim()) {
      setError('Upload a video file or enter a direct video URL');
      return;
    }

    setLoading(true);

    try {
      if (videoFile) {
        // Upload flow → /api/uploads/video (creates UPLOADED draft, no job).
        const formData = new FormData();
        formData.append('file', videoFile);
        formData.append('title', videoFile.name.replace(/\.[^.]+$/, ''));

        const res = await fetch('/api/uploads/video', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Failed to upload video');

        router.push(`/projects/${data.data.project_id}/configure`);
        return;
      }

      // Direct URL flow → /api/projects (creates DRAFT, no job).
      const url = videoUrl.trim();

      // YouTube URLs are handled by the backend downloader worker.
      if (isYouTubeUrl(url)) {
        setNotice('YouTube link detected. Preparing source video...');

        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: url, sourceLang: 'auto' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Failed to create project');

        router.push(`/projects/${data.data.project_id}/configure`);
        return;
      }

      // Platform URLs are not supported by the self-processing worker (spec B).
      const platform = detectPlatform(url);
      if (platform) {
        setError(`${platform} links are not supported yet. Direct video URL supported. YouTube/TikTok support coming soon.`);
        setLoading(false);
        return;
      }

      if (!isDirectVideoUrl(url)) {
        setError('Please paste a direct video file URL (.mp4/.mov/.webm/.mkv). YouTube/TikTok support coming soon.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: url, title: `Clip from ${new URL(url).hostname}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create project');

      router.push(`/projects/${data.data.project_id}/configure`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary pointer-events-none">
            <LinkIcon className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              if (videoFile) setVideoFile(null);
            }}
            placeholder="Paste a direct video URL (.mp4 / .mov / .webm)..."
            className="w-full bg-card border-2 border-border rounded-xl pl-12 pr-4 py-4 text-base text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
            aria-label="Video URL"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1 bg-card border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-accent/60 transition-colors">
            <input
              type="file"
              accept={ACCEPTED_EXT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                if (file) {
                  // Validate type/size up front (spec B upload validation).
                  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
                  const validType = ACCEPTED_TYPES.includes(file.type) || ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
                  if (!validType) {
                    setError('Unsupported file type. Please upload MP4, MOV, WEBM, or MKV.');
                    return;
                  }
                  const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 2048);
                  if (file.size > maxMb * 1024 * 1024) {
                    const sizeMb = Math.round(file.size / (1024 * 1024));
                    setError(`Video file size is ${sizeMb} MB, exceeding the limit of ${maxMb} MB.`);
                    return;
                  }
                  setError('');
                  setVideoFile(file);
                  if (videoUrl) setVideoUrl('');
                }
              }}
            />
            <div className="flex items-center justify-center gap-3 text-sm text-secondary">
              <Upload className="w-5 h-5 text-accent" />
              <span className="truncate">
                {videoFile ? videoFile.name : 'Upload local video'}
              </span>
            </div>
          </label>

          <button
            type="button"
            disabled
            title="Google Drive import coming soon"
            className="bg-card border-2 border-border rounded-xl p-4 text-sm text-secondary/60 cursor-not-allowed flex items-center justify-center gap-2 min-w-[160px]"
          >
            <Cloud className="w-5 h-5" />
            Google Drive
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-energy/10 text-energy">Soon</span>
          </button>
        </div>

        {error && (
          <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert flex items-start gap-2" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 text-sm text-accent">
            {notice}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full h-12 text-base font-semibold">
          <Sparkles className="w-5 h-5 mr-2" />
          Get clips in 1 click
        </Button>

        <p className="text-center text-sm text-secondary">
          Direct video URLs, local uploads, and YouTube links supported. Other platforms coming soon.
        </p>
      </form>
    </div>
  );
}
