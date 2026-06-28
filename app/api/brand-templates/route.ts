import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandTemplates } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

/**
 * GET /api/brand-templates
 * Get all brand templates from database
 */
export async function GET(request: NextRequest) {
  try {
    const templates = await db
      .select()
      .from(brandTemplates)
      .orderBy(desc(brandTemplates.created_at));

    return NextResponse.json({
      data: templates,
      meta: {
        total: templates.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch brand templates:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_TEMPLATES_ERROR',
          message: 'Failed to fetch brand templates',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
