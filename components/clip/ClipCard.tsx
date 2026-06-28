'use client';

import { Clip } from '@/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatDuration, truncate, copyToClipboard, extractBareClipId } from '@/lib/utils';
import {
  Download,
  Copy,
  FolderPlus,
  Share2,
  ExternalLink,
  Play,
} from 'lucide-react';
import { useState } from 'react';

export interface ClipCardProps {
  clip: Clip;
  onAddToCollection?: (clipId: string) => void;
  onGenerateSocialCopy?: (clipId: string) => void;
}

export default function ClipCard({
  clip,
  onAddToCollection,
  onGenerateSocialCopy,
}: ClipCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCaption = async () => {
    const caption = `${clip.title}\n\n${clip.description || ''}\n\n${clip.hashtags || ''}`.trim();
    const success = await copyToClipboard(caption);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (clip.uri_for_export) {
      window.open(clip.uri_for_export, '_blank');
    }
  };

  const bareClipId = extractBareClipId(clip.opus_clip_id);

  return (
    <div className="card p-4 space-y-3">
      {/* Video Preview */}
      <div className="relative aspect-[9/16] bg-sidebar rounded-lg overflow-hidden group">
        {clip.uri_for_preview ? (
          <div className="relative w-full h-full">
            <video
              src={clip.uri_for_preview}
              className="w-full h-full object-cover"
              preload="metadata"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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

        {/* Duration Badge */}
        {clip.duration_ms && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 text-white text-xs font-medium">
            {formatDuration(clip.duration_ms)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {/* Title */}
        <h3 className="text-sm font-semibold text-primary line-clamp-2">
          {clip.title}
        </h3>

        {/* Text Excerpt */}
        {clip.text && (
          <p className="text-xs text-secondary line-clamp-2">
            {truncate(clip.text, 120)}
          </p>
        )}

        {/* Keywords */}
        {clip.keywords && clip.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clip.keywords.slice(0, 3).map((keyword, idx) => (
              <Badge key={idx} variant="default" className="text-[10px]">
                {keyword}
              </Badge>
            ))}
            {clip.keywords.length > 3 && (
              <Badge variant="default" className="text-[10px]">
                +{clip.keywords.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Genre */}
        {clip.genre && (
          <div className="text-xs text-secondary">
            <span className="font-medium">Genre:</span> {clip.genre}
            {clip.subgenre && ` • ${clip.subgenre}`}
          </div>
        )}

        {/* Hashtags */}
        {clip.hashtags && (
          <div className="text-xs text-accent line-clamp-1">
            {clip.hashtags}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {/* Primary Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleDownload}
            disabled={!clip.uri_for_export}
          >
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyCaption}
          >
            <Copy className="w-4 h-4 mr-1" />
            {copied ? 'Copied!' : 'Caption'}
          </Button>
        </div>

        {/* Secondary Actions */}
        <div className="flex gap-2">
          {onAddToCollection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddToCollection(bareClipId)}
              title="Add to collection"
              className="flex-1"
            >
              <FolderPlus className="w-4 h-4 mr-1" />
              <span className="text-xs">Collection</span>
            </Button>
          )}

          {onGenerateSocialCopy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onGenerateSocialCopy(bareClipId)}
              title="Generate social copy"
              className="flex-1"
            >
              <Share2 className="w-4 h-4 mr-1" />
              <span className="text-xs">Social</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            title="View details"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Clip ID */}
      <div className="pt-2 border-t border-border">
        <div className="text-[10px] text-secondary font-mono truncate" title={clip.opus_clip_id}>
          {clip.opus_clip_id}
        </div>
      </div>
    </div>
  );
}
