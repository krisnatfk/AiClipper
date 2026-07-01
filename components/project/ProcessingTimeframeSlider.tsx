'use client';

import { useMemo, useState } from 'react';

type PresetMode = 'full' | 'first5' | 'first10' | 'creditSaver' | 'custom';

interface ProcessingTimeframeSliderProps {
  durationSeconds: number | null;
  startSec: number;
  endSec: number;
  onChange: (startSec: number, endSec: number) => void;
  onPresetChange?: (preset: PresetMode) => void;
  disabled?: boolean;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ProcessingTimeframeSlider({
  durationSeconds,
  startSec,
  endSec,
  onChange,
  onPresetChange,
  disabled = false,
}: ProcessingTimeframeSliderProps) {
  const [presetMode, setPresetMode] = useState<PresetMode>('full');
  const duration = Math.max(0, Math.floor(durationSeconds || 0));
  const minRange = Math.min(30, Math.max(1, duration));
  const isReady = duration > 0;

  const safeStart = useMemo(() => {
    if (!isReady) return 0;
    return Math.min(Math.max(0, Math.floor(startSec || 0)), Math.max(0, duration - minRange));
  }, [duration, isReady, minRange, startSec]);

  const safeEnd = useMemo(() => {
    if (!isReady) return 0;
    const fallbackEnd = endSec > 0 ? endSec : duration;
    return Math.min(duration, Math.max(safeStart + minRange, Math.floor(fallbackEnd)));
  }, [duration, endSec, isReady, minRange, safeStart]);

  const startPct = isReady ? (safeStart / duration) * 100 : 0;
  const endPct = isReady ? (safeEnd / duration) * 100 : 100;
  const selectedDuration = Math.max(0, safeEnd - safeStart);
  const isLongVideo = duration >= 30 * 60;

  const applyPreset = (preset: PresetMode) => {
    if (!isReady || disabled) return;
    let nextStart = 0;
    let nextEnd = duration;

    if (preset === 'first5') nextEnd = Math.min(300, duration);
    if (preset === 'first10') nextEnd = Math.min(600, duration);
    if (preset === 'creditSaver') nextEnd = Math.min(1200, duration);

    nextEnd = Math.max(minRange, nextEnd);
    setPresetMode(preset);
    onPresetChange?.(preset);
    onChange(nextStart, nextEnd);
  };

  const setStart = (value: number) => {
    if (!isReady || disabled) return;
    const nextStart = Math.min(Math.max(0, Math.floor(value)), safeEnd - minRange);
    setPresetMode('custom');
    onPresetChange?.('custom');
    onChange(nextStart, safeEnd);
  };

  const setEnd = (value: number) => {
    if (!isReady || disabled) return;
    const nextEnd = Math.max(Math.min(duration, Math.floor(value)), safeStart + minRange);
    setPresetMode('custom');
    onPresetChange?.('custom');
    onChange(safeStart, nextEnd);
  };

  if (!isReady) {
    return (
      <section className="rounded-lg border border-border bg-[#161719] p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-primary">Processing timeframe</h3>
          <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Credit saver</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-border/80 animate-pulse" />
        <p className="mt-3 text-xs text-secondary">
          Waiting for video metadata... Uploads are probed automatically. Remote links may show duration after the source is downloaded.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-[#161719] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-primary">Processing timeframe</h3>
          <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Credit saver</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PresetButton active={presetMode === 'full'} onClick={() => applyPreset('full')}>Full video</PresetButton>
          <PresetButton active={presetMode === 'first5'} onClick={() => applyPreset('first5')}>First 5 minutes</PresetButton>
          <PresetButton active={presetMode === 'first10'} onClick={() => applyPreset('first10')}>First 10 minutes</PresetButton>
          <PresetButton active={presetMode === 'creditSaver'} onClick={() => applyPreset('creditSaver')}>Credit saver</PresetButton>
          <PresetButton active={presetMode === 'custom'} onClick={() => setPresetMode('custom')}>Custom</PresetButton>
        </div>
      </div>

      <div className="relative mt-6 h-7">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#3A3A3D]" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={safeStart}
          disabled={disabled}
          onChange={(event) => setStart(Number(event.target.value))}
          className="timeframe-range timeframe-range-start"
          aria-label="Start time"
        />
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={safeEnd}
          disabled={disabled}
          onChange={(event) => setEnd(Number(event.target.value))}
          className="timeframe-range timeframe-range-end"
          aria-label="End time"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="rounded-md bg-[#25262A] px-3 py-2 font-mono text-sm text-secondary">{formatTime(safeStart)}</div>
        <div className="text-xs text-secondary">{formatTime(selectedDuration)} selected</div>
        <div className="rounded-md bg-[#25262A] px-3 py-2 font-mono text-sm text-secondary">{formatTime(safeEnd)}</div>
      </div>

      {isLongVideo && (
        <p className="mt-3 text-xs text-secondary">
          Long videos take longer to process. Use timeframe to process only important parts.
        </p>
      )}
    </section>
  );
}

function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-white text-black' : 'bg-[#242528] text-secondary hover:text-primary'
      }`}
    >
      {children}
    </button>
  );
}
