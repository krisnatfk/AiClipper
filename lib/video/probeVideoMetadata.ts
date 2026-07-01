import { spawn } from 'child_process';
import path from 'path';
import { getFfprobePath } from '@/lib/system/config.mjs';

export interface VideoMetadataProbe {
  durationSeconds: number;
  width: number;
  height: number;
  fps: string | null;
  codec: string | null;
  rawMetadata: unknown;
}

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `ffprobe exited with code ${code}`));
    });
  });
}

export async function probeVideoMetadata(filePath: string): Promise<VideoMetadataProbe | null> {
  try {
    const workspace = process.cwd();
    const absolutePath = path.resolve(workspace, filePath);
    if (!absolutePath.toLowerCase().startsWith(workspace.toLowerCase())) {
      throw new Error('Refusing to probe a file outside the workspace.');
    }

    const { stdout } = await runCommand(getFfprobePath() || 'ffprobe', [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      absolutePath,
    ]);
    const metadata = JSON.parse(stdout);
    const videoStream = metadata.streams?.find((stream: any) => stream.codec_type === 'video');
    if (!videoStream) return null;

    return {
      durationSeconds: Math.round(Number(metadata.format?.duration || videoStream.duration || 0)),
      width: Number(videoStream.width || 0),
      height: Number(videoStream.height || 0),
      fps: videoStream.avg_frame_rate || videoStream.r_frame_rate || null,
      codec: videoStream.codec_name || null,
      rawMetadata: metadata,
    };
  } catch {
    return null;
  }
}
