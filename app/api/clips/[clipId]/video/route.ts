import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

function resolveLocalPath(relativePath: string) {
  const workspace = process.cwd();
  const absolutePath = path.resolve(workspace, relativePath);
  if (!absolutePath.toLowerCase().startsWith(workspace.toLowerCase())) {
    throw new Error('Invalid clip path.');
  }
  return absolutePath;
}

function parseRange(rangeHeader: string | null, fileSize: number) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return 'invalid';

  const [, rawStart, rawEnd] = match;
  let start: number;
  let end: number;

  if (!rawStart && !rawEnd) return 'invalid';

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'invalid';
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : fileSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return 'invalid';
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

export async function GET(
  request: Request,
  { params }: { params: { clipId: string } }
) {
  try {
    const [clip] = await db
      .select()
      .from(clips)
      .where(eq(clips.clip_id, params.clipId))
      .limit(1);

    if (!clip?.output_file_path) {
      return NextResponse.json(
        {
          error: {
            code: 'CLIP_NOT_FOUND',
            message: 'Rendered clip was not found.',
          },
        },
        { status: 404 }
      );
    }

    const filePath = resolveLocalPath(clip.output_file_path);
    const fileStats = await stat(filePath);
    const range = parseRange(request.headers.get('range'), fileStats.size);

    if (range === 'invalid') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileStats.size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    if (range) {
      const stream = Readable.toWeb(createReadStream(filePath, range)) as unknown as BodyInit;
      const contentLength = range.end - range.start + 1;

      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${range.start}-${range.end}/${fileStats.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    const file = await readFile(filePath);

    return new NextResponse(file, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(file.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Failed to serve clip video:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVE_CLIP_VIDEO_ERROR',
          message: error instanceof Error ? error.message : 'Failed to serve clip video.',
        },
      },
      { status: 500 }
    );
  }
}
