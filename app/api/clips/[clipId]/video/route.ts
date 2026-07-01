import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { open, stat } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const VIDEO_CONTENT_TYPE = 'video/mp4';
const CACHE_CONTROL = 'public, max-age=3600';
const STREAM_CHUNK_SIZE = 64 * 1024;

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

function isInvalidClosedStreamError(error: unknown) {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === 'ERR_INVALID_STATE';
}

function createAbortSafeFileStream(
  request: Request,
  filePath: string,
  options: { start: number; end: number },
  logMeta: { clipId: string; rangeHeader: string | null; fileSize: number; start?: number; end?: number }
) {
  const fileHandlePromise = open(filePath, 'r');
  let position = options.start;
  let canceled = false;
  let closed = false;

  const closeFile = async () => {
    if (closed) return;
    closed = true;
    request.signal.removeEventListener('abort', abortStream);
    try {
      const fileHandle = await fileHandlePromise;
      await fileHandle.close();
    } catch (error) {
      if (!canceled) {
        console.error('Video stream close error:', {
          ...logMeta,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const abortStream = () => {
    canceled = true;
    void closeFile();
  };

  request.signal.addEventListener('abort', abortStream, { once: true });

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (canceled || request.signal.aborted) {
        canceled = true;
        await closeFile();
        return;
      }

      if (position > options.end) {
        await closeFile();
        try {
          controller.close();
        } catch (error) {
          if (!isInvalidClosedStreamError(error)) throw error;
        }
        return;
      }

      const bytesToRead = Math.min(STREAM_CHUNK_SIZE, options.end - position + 1);
      const buffer = Buffer.allocUnsafe(bytesToRead);

      try {
        const fileHandle = await fileHandlePromise;
        const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, position);

        if (bytesRead <= 0) {
          await closeFile();
          if (!canceled && !request.signal.aborted) {
            try {
              controller.close();
            } catch (error) {
              if (!isInvalidClosedStreamError(error)) throw error;
            }
          }
          return;
        }

        position += bytesRead;

        if (canceled || request.signal.aborted) {
          canceled = true;
          await closeFile();
          return;
        }

        try {
          controller.enqueue(buffer.subarray(0, bytesRead));
        } catch (error) {
          canceled = true;
          await closeFile();
          if (!isInvalidClosedStreamError(error)) throw error;
        }
      } catch (error) {
        canceled = true;
        await closeFile();
        if (request.signal.aborted || isInvalidClosedStreamError(error)) return;
        console.error('Video stream error:', {
          ...logMeta,
          error: error instanceof Error ? error.message : String(error),
        });
        controller.error(error);
      }
    },
    async cancel() {
      canceled = true;
      await closeFile();
    },
  });
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
    const fileSize = fileStats.size;
    const rangeHeader = request.headers.get('range');
    const range = parseRange(rangeHeader, fileSize);

    if (range === 'invalid') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

    if (range) {
      const contentLength = range.end - range.start + 1;
      const stream = createAbortSafeFileStream(request, filePath, range, {
        clipId: params.clipId,
        rangeHeader,
        start: range.start,
        end: range.end,
        fileSize,
      });

      console.info('Serving clip video range:', {
        clipId: params.clipId,
        rangeHeader,
        start: range.start,
        end: range.end,
        fileSize,
      });

      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Type': VIDEO_CONTENT_TYPE,
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': CACHE_CONTROL,
        },
      });
    }

    const stream = createAbortSafeFileStream(request, filePath, { start: 0, end: Math.max(0, fileSize - 1) }, {
      clipId: params.clipId,
      rangeHeader,
      fileSize,
    });

    console.info('Serving full clip video:', {
      clipId: params.clipId,
      rangeHeader,
      fileSize,
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': VIDEO_CONTENT_TYPE,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': CACHE_CONTROL,
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
