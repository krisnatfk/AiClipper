import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const VIDEO_MIME_PREFIX = 'video/';

export function getStorageDir(kind: 'uploads' | 'outputs' | 'tmp'): string {
  const configured = {
    uploads: process.env.LOCAL_UPLOAD_DIR || './storage/uploads',
    outputs: process.env.LOCAL_OUTPUT_DIR || './storage/outputs',
    tmp: process.env.LOCAL_TEMP_DIR || './storage/tmp',
  }[kind];

  return path.resolve(process.cwd(), configured);
}

export function getMaxUploadMb(): number {
  return Number(process.env.MAX_UPLOAD_SIZE_MB || 2048);
}

export function getMaxUploadBytes(): number {
  return getMaxUploadMb() * 1024 * 1024;
}

export function sanitizeFileExtension(filename: string): string {
  const ext = path.extname(filename || '').toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? ext : '.mp4';
}

export function isSupportedVideoFile(file: File): boolean {
  const ext = sanitizeFileExtension(file.name);
  return file.type.startsWith(VIDEO_MIME_PREFIX) && VIDEO_EXTENSIONS.has(ext);
}

export async function saveUploadedVideo(file: File, projectId: string): Promise<{
  absolutePath: string;
  relativePath: string;
  size: number;
}> {
  if (!isSupportedVideoFile(file)) {
    throw new Error('File must be a supported video format: MP4, MOV, WEBM, or MKV.');
  }

  if (file.size <= 0) {
    throw new Error('Uploaded video is empty.');
  }

  if (file.size > getMaxUploadBytes()) {
    const sizeMb = Math.round(file.size / (1024 * 1024));
    throw new Error(`Video file size is ${sizeMb} MB, exceeding the limit of ${getMaxUploadMb()} MB.`);
  }

  const uploadDir = getStorageDir('uploads');
  await mkdir(uploadDir, { recursive: true });

  const ext = sanitizeFileExtension(file.name);
  const filename = `${projectId}${ext}`;
  const absolutePath = path.join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath),
    size: file.size,
  };
}

