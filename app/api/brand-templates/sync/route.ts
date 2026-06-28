import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandTemplates } from '@/lib/db/schema';
import { getBrandTemplates } from '@/lib/opus/opusClient';
import { eq } from 'drizzle-orm';

/**
 * POST /api/brand-templates/sync
 * Sync brand templates from OpusClip API
 */
export async function POST(request: NextRequest) {
  try {
    // Fetch brand templates from OpusClip API
    const opusTemplates = await getBrandTemplates();

    if (!opusTemplates || opusTemplates.length === 0) {
      return NextResponse.json({
        data: {
          message: 'No brand templates available',
          synced: 0,
        },
      });
    }

    // Save templates to database
    let syncedCount = 0;
    const savedTemplates = [];

    for (const opusTemplate of opusTemplates) {
      try {
        // Extract template ID (OpusClip API response structure may vary)
        const templateId = opusTemplate.id || opusTemplate.brandTemplateId || opusTemplate._id;
        const templateName = opusTemplate.name || opusTemplate.title || 'Unnamed Template';

        if (!templateId) {
          console.warn('Skipping template without ID:', opusTemplate);
          continue;
        }

        // Check if template already exists
        const [existingTemplate] = await db
          .select()
          .from(brandTemplates)
          .where(eq(brandTemplates.brand_template_id, templateId))
          .limit(1);

        if (existingTemplate) {
          // Update existing template
          const [updatedTemplate] = await db
            .update(brandTemplates)
            .set({
              name: templateName,
              raw_response: opusTemplate,
              updated_at: new Date().toISOString(),
            })
            .where(eq(brandTemplates.id, existingTemplate.id))
            .returning();

          savedTemplates.push(updatedTemplate);
        } else {
          // Insert new template
          const [newTemplate] = await db
            .insert(brandTemplates)
            .values({
              brand_template_id: templateId,
              name: templateName,
              is_default: false,
              raw_response: opusTemplate,
            })
            .returning();

          savedTemplates.push(newTemplate);
        }

        syncedCount++;
      } catch (templateError) {
        console.error(
          `Failed to save template ${opusTemplate.id || 'unknown'}:`,
          templateError
        );
        // Continue with next template
      }
    }

    return NextResponse.json({
      data: {
        message: `Successfully synced ${syncedCount} brand templates`,
        synced: syncedCount,
        total: opusTemplates.length,
        templates: savedTemplates,
      },
    });
  } catch (error) {
    console.error('Failed to sync brand templates:', error);

    return NextResponse.json(
      {
        error: {
          code: 'SYNC_TEMPLATES_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync brand templates',
          details: error instanceof Error ? error.stack : undefined,
        },
      },
      { status: 500 }
    );
  }
}
