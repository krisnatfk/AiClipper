import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { renderTemplates } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * GET /api/templates?type=caption|render|hook
 *
 * List render/caption templates (spec Section C.11 / G). Built-in presets and
 * user-created templates are returned together; the `is_builtin` flag lets the
 * UI distinguish them (user templates can be edited/deleted, presets cannot).
 */
export async function GET(request: NextRequest) {
  try {
    const type = new URL(request.url).searchParams.get('type');

    let query = db.select().from(renderTemplates);
    if (type) {
      query = query.where(eq(renderTemplates.type, type)) as typeof query;
    }

    const all = await query.orderBy(
      desc(renderTemplates.is_builtin),
      desc(renderTemplates.is_default),
      renderTemplates.name
    );

    return NextResponse.json({
      data: all.map((t) => ({
        ...t,
        caption_style: t.caption_style,
        hook_style: t.hook_style,
        layout_style: t.layout_style,
        export_settings: t.export_settings,
      })),
      meta: { total: all.length, builtin: all.filter((t) => t.is_builtin).length },
    });
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_TEMPLATES_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch templates',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates
 *
 * Create a user template (spec Section G). User-created templates are marked
 * is_builtin=false so the UI can allow edit/delete.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Template name is required.' } },
        { status: 400 }
      );
    }

    const type = body.type === 'render' || body.type === 'hook' ? body.type : 'caption';
    const templateId = `user_${randomUUID()}`;

    const [created] = await db
      .insert(renderTemplates)
      .values({
        template_id: templateId,
        name,
        type,
        is_builtin: false,
        is_default: false,
        caption_style: body.caption_style ?? null,
        hook_style: body.hook_style ?? null,
        layout_style: body.layout_style ?? null,
        logo_style: body.logo_style ?? null,
        export_settings: body.export_settings ?? null,
      })
      .returning();

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error('Failed to create template:', error);
    return NextResponse.json(
      {
        error: {
          code: 'CREATE_TEMPLATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create template',
        },
      },
      { status: 500 }
    );
  }
}
