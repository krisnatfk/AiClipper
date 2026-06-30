import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { renderTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function findByTemplateId(templateId: string) {
  // templateId from the URL is the stable slug, not the auto-increment id.
  const [row] = await db
    .select()
    .from(renderTemplates)
    .where(eq(renderTemplates.template_id, templateId))
    .limit(1);
  return row;
}

/**
 * GET /api/templates/[templateId]
 * Single template detail (used by the editor / configure picker).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    const template = await findByTemplateId(params.templateId);
    if (!template) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Template not found' } },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: template });
  } catch (error) {
    console.error('Failed to fetch template:', error);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_TEMPLATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch template',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/templates/[templateId]
 *
 * Update a user template (spec Section G). Built-in presets are read-only —
 * the UI should clone them into a user template before editing, so we reject
 * edits to is_builtin rows to protect the seed data.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    const existing = await findByTemplateId(params.templateId);
    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Template not found' } },
        { status: 404 }
      );
    }

    if (existing.is_builtin) {
      return NextResponse.json(
        {
          error: {
            code: 'PRESET_READ_ONLY',
            message: 'Built-in presets cannot be edited. Duplicate it to a new template first.',
          },
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const [updated] = await db
      .update(renderTemplates)
      .set({
        name: body.name != null ? String(body.name) : existing.name,
        caption_style: body.caption_style ?? existing.caption_style,
        hook_style: body.hook_style ?? existing.hook_style,
        layout_style: body.layout_style ?? existing.layout_style,
        logo_style: body.logo_style ?? existing.logo_style,
        export_settings: body.export_settings ?? existing.export_settings,
        is_default:
          typeof body.is_default === 'boolean' ? body.is_default : existing.is_default,
        updated_at: new Date().toISOString(),
      })
      .where(eq(renderTemplates.template_id, params.templateId))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Failed to update template:', error);
    return NextResponse.json(
      {
        error: {
          code: 'UPDATE_TEMPLATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update template',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[templateId]
 *
 * Delete a user template (spec Section G). Built-in presets are protected and
 * cannot be removed from the UI — re-seed the DB to reset them.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    const existing = await findByTemplateId(params.templateId);
    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Template not found' } },
        { status: 404 }
      );
    }

    if (existing.is_builtin) {
      return NextResponse.json(
        {
          error: {
            code: 'PRESET_PROTECTED',
            message: 'Built-in presets cannot be deleted.',
          },
        },
        { status: 403 }
      );
    }

    await db
      .delete(renderTemplates)
      .where(eq(renderTemplates.template_id, params.templateId));

    return NextResponse.json({ data: { templateId: params.templateId, deleted: true } });
  } catch (error) {
    console.error('Failed to delete template:', error);
    return NextResponse.json(
      {
        error: {
          code: 'DELETE_TEMPLATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete template',
        },
      },
      { status: 500 }
    );
  }
}
