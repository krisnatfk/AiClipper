import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processingLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const logs = await db
      .select()
      .from(processingLogs)
      .where(eq(processingLogs.project_id, params.projectId))
      .orderBy(desc(processingLogs.created_at));

    return NextResponse.json({
      data: logs,
      meta: {
        total: logs.length,
        projectId: params.projectId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch processing logs:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_PROCESSING_LOGS_ERROR',
          message: 'Failed to fetch processing logs',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

