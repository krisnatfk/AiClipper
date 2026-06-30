import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import path from 'path';

function resolveLocalPath(relativePath: string) {
  const workspace = process.cwd();
  const absolutePath = path.resolve(workspace, relativePath);
  if (!absolutePath.toLowerCase().startsWith(workspace.toLowerCase())) {
    throw new Error('Invalid thumbnail path.');
  }
  return absolutePath;
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

    if (!clip?.thumbnail_file_path) {
      return NextResponse.json(
        {
          error: {
            code: 'THUMBNAIL_NOT_FOUND',
            message: 'Clip thumbnail was not found.',
          },
        },
        { status: 404 }
      );
    }

    const file = await readFile(resolveLocalPath(clip.thumbnail_file_path));

    return new NextResponse(file, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(file.byteLength),
      },
    });
  } catch (error) {
    console.error('Failed to serve clip thumbnail:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVE_CLIP_THUMBNAIL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to serve clip thumbnail.',
        },
      },
      { status: 500 }
    );
  }
}
