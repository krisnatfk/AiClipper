import AppShell from '@/components/layout/AppShell';
import Badge from '@/components/ui/Badge';
import { validateEnvironment } from '@/lib/system/environmentValidator.mjs';
import {
  Terminal,
  Activity,
  Video,
  Cpu,
  CircuitBoard,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { EnvironmentValidationResult } from '@/types';

function StatusRow({
  label,
  description,
  ok,
}: {
  label: string;
  description: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div>
        <div className="text-sm font-medium text-primary">{label}</div>
        <div className="text-xs text-secondary mt-0.5">{description}</div>
      </div>
      <Badge variant={ok ? 'success' : 'alert'}>{ok ? 'OK' : 'Failed'}</Badge>
    </div>
  );
}

function PackageRow({
  label,
  installed,
}: {
  label: string;
  installed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div className="text-sm font-medium text-primary">{label}</div>
      <Badge variant={installed ? 'success' : 'alert'}>
        {installed ? 'Installed' : 'Missing'}
      </Badge>
    </div>
  );
}

export default async function SystemHealthPage() {
  const env = (await validateEnvironment()) as EnvironmentValidationResult;

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">System Health</h1>
            <p className="text-sm text-secondary">
              Environment validation for FFmpeg, Python, and AI dependencies.
            </p>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Video Processing</h2>
                <p className="text-sm text-secondary">FFmpeg, FFprobe, and Python paths</p>
              </div>
            </div>
            <div className="space-y-1">
              <StatusRow label="FFmpeg" description={env.ffmpeg.version || env.ffmpeg.path || 'Not configured'} ok={env.ffmpeg.ok} />
              <StatusRow label="FFprobe" description={env.ffprobe.version || env.ffprobe.path || 'Not configured'} ok={env.ffprobe.ok} />
              <StatusRow label="Python" description={env.python.version || env.python.path || 'Not configured'} ok={env.python.ok} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Python Packages</h2>
                <p className="text-sm text-secondary">Packages required for transcription and reframe</p>
              </div>
            </div>
            <div className="space-y-1">
              <PackageRow label="faster-whisper" installed={env.packages.faster_whisper} />
              <PackageRow label="OpenCV (cv2)" installed={env.packages.cv2} />
              <PackageRow label="MediaPipe" installed={env.packages.mediapipe} />
              <PackageRow label="NumPy" installed={env.packages.numpy} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-energy/10 flex items-center justify-center">
                <CircuitBoard className="w-5 h-5 text-energy" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Transcription Engine</h2>
                <p className="text-sm text-secondary">Current configuration</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">Engine</div>
                <div className="text-sm text-secondary font-mono">{env.whisper.engine}</div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">Model</div>
                <div className="text-sm text-secondary font-mono">{env.whisper.model}</div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">Device</div>
                <div className="text-sm text-secondary font-mono">{env.whisper.device}</div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2 border-b border-border">
                <div className="text-sm font-medium text-primary">CUDA</div>
                <div className="text-sm text-secondary font-mono">
                  {env.cuda.requested ? 'Requested' : 'Not requested'}
                  {' / '}
                  {env.cuda.available ? 'Available' : 'Unavailable'}
                  {env.cuda.fallbackToCpu && ' (fallback CPU)'}
                </div>
              </div>
            </div>
          </div>

          {env.warnings.length > 0 && (
            <div className="card p-6 bg-energy/5 border-energy/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-energy" />
                <h3 className="text-sm font-semibold text-primary">Warnings</h3>
              </div>
              <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
                {env.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {env.errors.length > 0 && (
            <div className="card p-6 bg-alert/5 border-alert/20">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-5 h-5 text-alert" />
                <h3 className="text-sm font-semibold text-primary">Errors</h3>
              </div>
              <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
                {env.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {env.installCommand && (
            <div className="card p-6 bg-accent/5 border-accent/20">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-5 h-5 text-accent" />
                <h3 className="text-sm font-semibold text-primary">Recommended Fix</h3>
              </div>
              <p className="text-sm text-secondary mb-2">
                Run this command in PowerShell to install missing packages:
              </p>
              <pre className="bg-sidebar p-3 rounded text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap">
                {env.installCommand}
              </pre>
            </div>
          )}

          <div className="card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-success" />
              <h3 className="text-sm font-semibold text-primary">Overall Status</h3>
            </div>
            <div className="flex items-center gap-2">
              {env.ok ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <span className="text-sm text-secondary">Environment is ready for processing.</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-alert" />
                  <span className="text-sm text-secondary">Environment has issues that must be fixed before processing.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
