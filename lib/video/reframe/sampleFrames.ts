import { mkdir } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getFfmpegPath } from '@/lib/system/config.mjs';
import type { FrameSample } from './types';

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

export async function sampleFrames(inputPath: string, outputDir: string, fps = 2): Promise<FrameSample[]> {
  await mkdir(outputDir, { recursive: true });
  const ffmpegPath = getFfmpegPath()!;
  const pattern = path.join(outputDir, 'frame_%05d.jpg');

  await run(ffmpegPath, ['-y', '-i', inputPath, '-vf', `fps=${fps}`, pattern]);

  return [];
}
