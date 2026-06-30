'use client';

import { useMemo } from 'react';

interface TimeframeSliderProps {
  /** Total video duration in seconds (null while probing). */
  durationSeconds: number | null;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

/**
 * Dual-range processing timeframe slider (spec Section C.10). Lets the user
 * restrict analysis/render to a sub-range ("Credit saver" / "Fast processing")
 * or keep the full video. Times are shown as HH:MM:SS.
 */
export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default function TimeframeSlider({
  durationSeconds,
  start,
  end,
  onChange,
}: TimeframeSliderProps) {
  const max = durationSeconds ?? 0;

  const safeStart = useMemo(() => Math.min(start, max), [start, max]);
  const safeEnd = useMemo(() => Math.min(Math.max(end, safeStart + 1), max || end), [end, safeStart, max]);

  const isFullVideo = safeStart === 0 && safeEnd === max;

  const setFast = () => onChange(0, Math.min(300, max || 300));
  const setFull = () => onChange(0, max);
  const setStart = (v: number) => onChange(Math.min(v, safeEnd - 1), safeEnd);
  const setEnd = (v: number) => onChange(safeStart, Math.max(v, safeStart + 1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-secondary">
        <span>
          Start: <span className="font-mono text-primary">{formatTimecode(safeStart)}</span>
        </span>
        <span>
          End: <span className="font-mono text-primary">{formatTimecode(safeEnd)}</span>
        </span>
      </div>

      {max > 0 ? (
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={max}
            value={safeStart}
            onChange={(e) => setStart(Number(e.target.value))}
            className="w-full accent-accent"
            aria-label="Start time"
          />
          <input
            type="range"
            min={0}
            max={max}
            value={safeEnd}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="w-full accent-accent"
            aria-label="End time"
          />
        </div>
      ) : (
        <p className="text-xs text-secondary italic">
          Video duration will be available after the worker probes the file. Defaults to full video.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={setFull}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            isFullVideo ? 'bg-accent text-white' : 'bg-card border border-border text-secondary hover:text-primary'
          }`}
        >
          Full video
        </button>
        <button
          type="button"
          onClick={setFast}
          disabled={max === 0}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-card border border-border text-secondary hover:text-primary disabled:opacity-40"
          title="Limit to first 5 minutes for faster processing"
        >
          Fast processing (first 5m)
        </button>
        {isFullVideo && (
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-energy/10 text-energy">
            Credit saver available
          </span>
        )}
      </div>
    </div>
  );
}
