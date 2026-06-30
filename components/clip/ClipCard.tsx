'use client';

import { Clip } from '@/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatDuration, truncate, copyToClipboard, extractBareClipId, scoreBucket } from '@/lib/utils';
import {
  Download,
  Copy,
  FolderPlus,
  Share2,
  Play,
  Edit2,
  Trash2,
  Copy as CopyIcon,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DeleteClipModal from './DeleteClipModal';

export interface ClipCardProps {
  clip: Clip;
  onAddToCollection?: (clipId: string) => void;
  onGenerateSocialCopy?: (clipId: string) => void;
  onDeleted?: (clipId: string) => void;
}

export default function ClipCard({
  clip,
  onAddToCollection,
  onGenerateSocialCopy,
  onDeleted,
}: ClipCardProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleCopyCaption = async () => {
    const caption = `${clip.title}\n\n${clip.caption || clip.description || ''}\n\n${clip.hashtags || ''}`.trim();
    const success = await copyToClipboard(caption);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const bareClipId = clip.clip_id || `clip-${clip.id}`;
    window.open(`/api/clips/${bareClipId}/video`, '_blank');
  };

  const handleDuplicate = async () => {
    const bareClipId = clip.clip_id || `clip-${clip.id}`;
    try {
      const res = await fetch(`/api/clips/${bareClipId}/duplicate`, { method: 'POST' });
      if (res.ok) {
        // Refresh the page to show the new clip.
        router.refresh();
      }
    } catch {
      /* best-effort */
    }
  };

  const handleRegenerate = async () => {
    const bareClipId = clip.clip_id || `clip-${clip.id}`;
    try {
      await fetch(`/api/clips/${bareClipId}/regenerate`, { method: 'POST' });
      router.refresh();
    } catch {
      /* best-effort */
    }
  };

  const previewUrl = clip.output_storage_url || clip.uri_for_preview;
  const thumbnailUrl = clip.thumbnail_storage_url;
  const bareClipId = clip.clip_id || (clip.opus_clip_id ? extractBareClipId(clip.opus_clip_id) : `clip-${clip.id}`);
  const score = clip.score ?? 0;
  const scoreInfo = scoreBucket(score);

  return (
    <>
      <div className="card p-4 space-y-3">
        {/* Video Preview */}
        <div className="relative aspect-[9/16] bg-sidebar rounded-lg overflow-hidden group">
          {previewUrl ? (
            <div className="relative w-full h-full">
              <video
                src={previewUrl}
                poster={thumbnailUrl || undefined}
                className="w-full h-full object-cover"
                preload="metadata"
                controls
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                  <Play className="w-8 h-8 text-canvas ml-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-12 h-12 text-secondary/30" />
            </div>
          )}

          {/* Score badge (spec E item 3) */}
          {score > 0 && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/80 backdrop-blur-sm">
              <span className="text-sm font-bold text-white">{score}</span>
              <span className="text-[10px] font-medium" style={{ color: scoreInfo.color }}>
                {scoreInfo.label}
              </span>
            </div>
          )}

          {/* Duration */}
          {(clip.duration_ms || clip.duration_seconds) && (
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 text-white text-xs font-medium">
              {clip.duration_ms ? formatDuration(clip.duration_ms) : `${clip.duration_seconds}s`}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-primary line-clamp-2">{clip.title}</h3>

          {(clip.hook_text || clip.text || clip.caption) && (
            <p className="text-xs text-secondary line-clamp-2">
              {truncate(clip.hook_text || clip.text || clip.caption || '', 120)}
            </p>
          )}

          {clip.hashtags && (
            <div className="text-xs text-accent line-clamp-1">{clip.hashtags}</div>
          )}
        </div>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" size="sm" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopyCaption}>
            <Copy className="w-4 h-4 mr-1" />
            {copied ? 'Copied!' : 'Caption'}
          </Button>
        </div>

        {/* Secondary actions row */}
        <div className="flex gap-1.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/editor/${bareClipId}`)}
            className="flex-1 !bg-accent hover:!bg-accent/90"
            title="Edit clip"
          >
            <Edit2 className="w-4 h-4 mr-1" />
            <span className="text-xs text-black font-semibold">Edit</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={handleDuplicate} title="Duplicate clip">
            <CopyIcon className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleRegenerate} title="Regenerate">
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} title="Delete clip" className="!text-alert hover:!bg-alert/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Placeholder actions (spec E items 9-10) */}
        <div className="flex gap-1.5">
          {onAddToCollection && (
            <Button variant="ghost" size="sm" onClick={() => onAddToCollection(bareClipId)} className="flex-1" title="Add to collection">
              <FolderPlus className="w-4 h-4 mr-1" />
              <span className="text-xs">Collection</span>
            </Button>
          )}
          {onGenerateSocialCopy && (
            <Button variant="ghost" size="sm" onClick={() => onGenerateSocialCopy(bareClipId)} className="flex-1" title="Share / schedule">
              <Share2 className="w-4 h-4 mr-1" />
              <span className="text-xs">Share</span>
            </Button>
          )}
        </div>

        <div className="pt-1.5 border-t border-border">
          <div className="text-[10px] text-secondary font-mono truncate" title={bareClipId}>
            {bareClipId}
          </div>
        </div>
      </div>

      <DeleteClipModal
        clip={clip}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onDeleted}
      />
    </>
  );
}
