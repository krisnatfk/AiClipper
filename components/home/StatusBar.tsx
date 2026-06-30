'use client';

import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

interface StatusBarProps {
  /** Total bytes used across all projects (computed server-side). */
  totalStorageBytes: number;
}

/**
 * Storage + auto-save/auto-import indicator bar (spec Section B items 8–10).
 * The toggles are visual-only preferences persisted to localStorage for now;
 * they do not yet wire to backend behavior. The storage figure is real and
 * reflects the sum of project storage_size values.
 */
export default function StatusBar({ totalStorageBytes }: StatusBarProps) {
  const [autoSave, setAutoSave] = useState(true);
  const [autoImport, setAutoImport] = useState(true);

  useEffect(() => {
    setAutoSave(localStorage.getItem('autoclip:autoSave') !== 'off');
    setAutoImport(localStorage.getItem('autoclip:autoImport') !== 'off');
  }, []);

  const toggle = (key: 'autoSave' | 'autoImport', value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    localStorage.setItem(`autoclip:${key}`, value ? 'on' : 'off');
  };

  return (
    <div className="hidden md:flex items-center gap-4 text-xs text-secondary">
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-energy" />
        <span>Storage: {formatBytes(totalStorageBytes)}</span>
      </div>

      <button
        type="button"
        onClick={() => toggle('autoSave', !autoSave, setAutoSave)}
        className="flex items-center gap-2 hover:text-primary transition-colors"
        aria-pressed={autoSave}
        title="Toggle auto-save (preference stored locally)"
      >
        <span className={`w-2 h-2 rounded-full ${autoSave ? 'bg-success animate-pulse' : 'bg-secondary/40'}`} />
        <span>Auto-save: {autoSave ? 'ON' : 'OFF'}</span>
      </button>

      <button
        type="button"
        onClick={() => toggle('autoImport', !autoImport, setAutoImport)}
        className="flex items-center gap-2 hover:text-primary transition-colors"
        aria-pressed={autoImport}
        title="Toggle auto-import (preference stored locally)"
      >
        <span className={`w-2 h-2 rounded-full ${autoImport ? 'bg-success animate-pulse' : 'bg-secondary/40'}`} />
        <span>Auto-import: {autoImport ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
}
