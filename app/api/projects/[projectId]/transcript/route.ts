import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transcripts } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.project_id, params.projectId))
      .orderBy(desc(transcripts.created_at))
      .limit(1);

    if (!transcript) {
      // No transcript yet is not an error — it just hasn't been generated.
      // Return 200 with null so the frontend polling loop doesn't log 404s
      // every 20s before the worker reaches the TRANSCRIBING step.
      return NextResponse.json({
        data: null,
        meta: {
          projectId: params.projectId,
          status: 'pending',
        },
      });
    }

    return NextResponse.json({
      data: transcript,
      meta: {
        projectId: params.projectId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch transcript:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_TRANSCRIPT_ERROR',
          message: 'Failed to fetch transcript',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
