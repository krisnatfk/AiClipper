'use client';

import { useState, useMemo } from 'react';
import { useEditorStore, TranscriptSegment } from '@/store/editorStore';
import { Search, Download } from 'lucide-react';

/**
 * Text-based transcript editor (spec Section F left panel). Each segment shows
 * a timing badge; the text is editable inline and syncs to the editor store.
 * Clicking a segment seeks the video preview. Includes search + download (.srt).
 */
export default function TranscriptEditor() {
  const { transcriptSegments, updateTranscriptSegment, setCurrentTime, setIsPlaying } = useEditorStore();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return transcriptSegments;
    const q = search.toLowerCase();
    return transcriptSegments.filter((s) => s.text.toLowerCase().includes(q));
  }, [transcriptSegments, search]);

  const handleSeek = (seg: TranscriptSegment) => {
    setCurrentTime(seg.start);
    setIsPlaying(true);
  };

  const formatBadge = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const downloadSrt = () => {
    const body = transcriptSegments
      .map((seg, i) => {
        const start = formatSrtTime(seg.start);
        const end = formatSrtTime(seg.end);
        return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
      })
      .join('\n');
    const blob = new Blob([body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary">Transcript</h3>
        {transcriptSegments.length > 0 && (
          <button
            type="button"
            onClick={downloadSrt}
            className="text-xs text-secondary hover:text-accent transition-colors flex items-center gap-1"
            title="Download .srt"
          >
            <Download className="w-3.5 h-3.5" />
            .srt
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcript..."
          className="w-full bg-canvas border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-primary placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-secondary italic py-4 text-center">
          {transcriptSegments.length === 0
            ? 'No transcript available yet.'
            : 'No matching segments.'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          {filtered.map((seg) => (
            <div
              key={seg.id}
              className="group flex gap-2 p-2 rounded-lg hover:bg-canvas/50 cursor-pointer transition-colors"
              onClick={() => handleSeek(seg)}
            >
              <span className="text-[10px] font-mono text-accent whitespace-nowrap mt-0.5">
                {formatBadge(seg.start)}
              </span>
              <textarea
                value={seg.text}
                onChange={(e) => updateTranscriptSegment(seg.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                rows={1}
                className="flex-1 bg-transparent text-xs text-secondary resize-none focus:outline-none focus:bg-canvas rounded p-1 focus:text-primary"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
