import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

/**
 * GET /api/projects/[projectId]/clips
 * Get all clips for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;

    if (!projectId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Project ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Fetch clips from database
    const projectClips = await db
      .select()
      .from(clips)
      .where(eq(clips.project_id, projectId))
      .orderBy(desc(clips.created_at));

    return NextResponse.json({
      data: projectClips,
      meta: {
        total: projectClips.length,
        projectId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch clips:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_CLIPS_ERROR',
          message: 'Failed to fetch clips',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
