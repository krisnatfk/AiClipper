import AppShell from '@/components/layout/AppShell';
import Badge from '@/components/ui/Badge';
import { testConnection } from '@/lib/db';
import { Database, HardDrive, ListChecks, Settings as SettingsIcon, Sparkles, Video } from 'lucide-react';
import { spawnSync } from 'child_process';

function commandAvailable(command: string) {
  const result = spawnSync(command, ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    version: result.stdout?.split(/\r?\n/)[0] || result.stderr?.split(/\r?\n/)[0] || 'Not found',
  };
}

async function getSettings() {
  const dbConnected = await testConnection();
  const ffmpeg = commandAvailable(process.env.FFMPEG_PATH || 'ffmpeg');
  const ffprobe = commandAvailable(process.env.FFPROBE_PATH || 'ffprobe');

  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME || process.env.APP_NAME || 'AutoClip AI',
    dbConnected,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    ffmpeg,
    ffprobe,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    transcriptionEngine: process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
    whisperModel: process.env.WHISPER_MODEL || 'small',
    whisperDevice: process.env.WHISPER_DEVICE || 'cpu',
    storageDriver: process.env.STORAGE_DRIVER || 'local',
    uploadDir: process.env.LOCAL_UPLOAD_DIR || './storage/uploads',
    outputDir: process.env.LOCAL_OUTPUT_DIR || './storage/outputs',
    queueDriver: process.env.QUEUE_DRIVER || 'database',
    opusConfigured: Boolean(process.env.OPUS_API_KEY),
  };
}

function StatusRow({
  label,
  description,
  value,
  ok,
}: {
  label: string;
  description: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div>
        <div className="text-sm font-medium text-primary">{label}</div>
        <div className="text-xs text-secondary mt-0.5">{description}</div>
      </div>
      {typeof ok === 'boolean' ? (
        <Badge variant={ok ? 'success' : 'alert'}>{value}</Badge>
      ) : (
        <div className="text-sm text-secondary font-mono text-right">{value}</div>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Settings</h1>
            <p className="text-sm text-secondary">
              System engine, storage, queue, and AI configuration status.
            </p>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">AI Engine</h2>
                <p className="text-sm text-secondary">Gemini highlight detection configuration</p>
              </div>
            </div>
            <div className="space-y-1">
              <StatusRow
                label="Gemini API Key"
                description="GEMINI_API_KEY is never exposed to the frontend"
                value={settings.geminiConfigured ? 'Configured' : 'Not set'}
                ok={settings.geminiConfigured}
              />
              <StatusRow label="Gemini Model" description="Model used for clip planning" value={settings.geminiModel} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Video Processing</h2>
                <p className="text-sm text-secondary">FFmpeg, FFprobe, and transcription engine</p>
              </div>
            </div>
            <div className="space-y-1">
              <StatusRow label="FFmpeg" description={settings.ffmpeg.version} value={settings.ffmpeg.ok ? 'Available' : 'Missing'} ok={settings.ffmpeg.ok} />
              <StatusRow label="FFprobe" description={settings.ffprobe.version} value={settings.ffprobe.ok ? 'Available' : 'Missing'} ok={settings.ffprobe.ok} />
              <StatusRow label="Transcription Engine" description={`${settings.whisperModel} on ${settings.whisperDevice}`} value={settings.transcriptionEngine} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-energy/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-energy" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Database & Queue</h2>
                <p className="text-sm text-secondary">Local project state and async processing jobs</p>
              </div>
            </div>
            <div className="space-y-1">
              <StatusRow label="Database" description="DATABASE_URL connection check" value={settings.dbConnected ? 'Connected' : 'Disconnected'} ok={settings.dbConnected} />
              <StatusRow label="Queue Driver" description="Worker reads processing_jobs from database" value={settings.queueDriver} />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">Storage</h2>
                <p className="text-sm text-secondary">Development storage paths and production driver</p>
              </div>
            </div>
            <div className="space-y-1">
              <StatusRow label="Storage Driver" description="STORAGE_DRIVER" value={settings.storageDriver} />
              <StatusRow label="Upload Directory" description="LOCAL_UPLOAD_DIR" value={settings.uploadDir} />
              <StatusRow label="Output Directory" description="LOCAL_OUTPUT_DIR" value={settings.outputDir} />
            </div>
          </div>

          <div className="card p-6 bg-accent/5 border-accent/20">
            <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" />
              Configuration Help
            </h3>
            <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">DATABASE_URL</code> stores projects, transcripts, jobs, and logs.</li>
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">GEMINI_API_KEY</code> is needed for Phase 5 AI clip planning.</li>
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">TRANSCRIBE_ENGINE</code> defaults to faster-whisper.</li>
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">OPUS_API_KEY</code> is legacy only and not used by the default engine.</li>
            </ul>
            <div className="mt-4 flex items-center gap-2 text-xs text-secondary">
              <ListChecks className="w-4 h-4 text-accent" />
              Current app: {settings.appName}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
