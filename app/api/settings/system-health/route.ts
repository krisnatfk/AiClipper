import { NextResponse } from 'next/server';
import { spawnSync } from 'child_process';
import { testConnection } from '@/lib/db';

function commandAvailable(command: string) {
  const result = spawnSync(command, ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    version: result.stdout?.split(/\r?\n/)[0] || result.stderr?.split(/\r?\n/)[0] || null,
  };
}

export async function GET() {
  const [dbConnected, ffmpeg, ffprobe] = await Promise.all([
    testConnection(),
    Promise.resolve(commandAvailable(process.env.FFMPEG_PATH || 'ffmpeg')),
    Promise.resolve(commandAvailable(process.env.FFPROBE_PATH || 'ffprobe')),
  ]);

  return NextResponse.json({
    data: {
      database: {
        connected: dbConnected,
        urlConfigured: Boolean(process.env.DATABASE_URL),
      },
      ffmpeg,
      ffprobe,
      ai: {
        provider: 'gemini',
        keyConfigured: Boolean(process.env.GEMINI_API_KEY),
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      },
      transcription: {
        engine: process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
        model: process.env.WHISPER_MODEL || 'small',
        device: process.env.WHISPER_DEVICE || 'cpu',
      },
      storage: {
        driver: process.env.STORAGE_DRIVER || 'local',
        uploadsDir: process.env.LOCAL_UPLOAD_DIR || './storage/uploads',
        outputsDir: process.env.LOCAL_OUTPUT_DIR || './storage/outputs',
      },
      queue: {
        driver: process.env.QUEUE_DRIVER || 'database',
      },
      legacy: {
        opusConfigured: Boolean(process.env.OPUS_API_KEY),
      },
    },
  });
}
