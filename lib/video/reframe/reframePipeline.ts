import { spawn } from 'child_process';
import path from 'path';
import type { ReframeAnalysisResult, ReframeMode } from './types';

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function analyzeReframe(options: {
  sourcePath: string;
  startSec: number;
  endSec: number;
  mode?: ReframeMode;
  sampleInterval?: number;
}): Promise<ReframeAnalysisResult> {
  const pythonPath = process.env.PYTHON_PATH || 'python';
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'track_subject.py');
  const stdout = await run(pythonPath, [
    scriptPath,
    '--input',
    options.sourcePath,
    '--start',
    String(options.startSec),
    '--end',
    String(options.endSec),
    '--aspect',
    '9:16',
    '--mode',
    options.mode || 'face-center-crop',
    '--sample-interval',
    String(options.sampleInterval ?? 0.5),
    '--max-samples',
    '160',
  ]);

  return JSON.parse(stdout);
}
