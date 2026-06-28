'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Upload, Link as LinkIcon } from 'lucide-react';

export default function HeroCreateInput() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!videoUrl.trim()) {
      setError('Please enter a video URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(videoUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);

    try {
      // Create project directly
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          title: 'Untitled Project',
          sourceLang: 'auto',
          model: 'ClipBasic',
          genre: 'Auto',
          layoutAspectRatio: 'portrait',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to create project');
      }

      const data = await response.json();

      // Redirect to project detail page
      router.push(`/projects/${data.data.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main Input */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary pointer-events-none">
            <LinkIcon className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste YouTube, TikTok, or video URL here..."
            className="w-full bg-card border-2 border-border rounded-xl pl-12 pr-4 py-4 text-base text-primary placeholder:text-secondary focus:outline-none focus:border-accent transition-colors"
            disabled={loading}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-alert/10 border border-alert/20 rounded-lg p-3 text-sm text-alert">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="flex-1 h-12 text-base font-semibold"
          >
            {loading ? 'Creating Project...' : 'Get clips in 1 click'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="sm:w-auto h-12"
            disabled={loading}
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="sm:w-auto h-12"
            disabled={loading}
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            Google Drive
          </Button>
        </div>
      </form>

      {/* Helper Text */}
      <p className="mt-6 text-center text-sm text-secondary">
        Supports YouTube, TikTok, Instagram, Twitter, and direct video links
      </p>
    </div>
  );
}
