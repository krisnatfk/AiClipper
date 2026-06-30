import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips, clipEdits, overlayLayers, trackingKeyframes } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * PATCH /api/clips/[clipId]/edit
 *
 * Save the non-destructive editor config (spec Section F, decision D6).
 *
 * Upserts the clip_edits row (layout_config, caption_config, hook_config,
 * render_config) and replaces the overlay layers for the clip (sync strategy:
 * delete existing + insert the new set, preserving any tracking keyframes only
 * for layers that survive). The clip's source video is never mutated — render
 * only happens when the user clicks Export (POST /api/clips/:id/render).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const [clip] = await db
      .select()
      .from(clips)
      .where(eq(clips.clip_id, params.clipId))
      .limit(1);

    if (!clip || !clip.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    // clip_id is non-null after the guard above; bind locally for type narrowing.
    const clipId = clip.clip_id;
    const body = await request.json();

    const layoutConfig = body.layout_config ?? body.layoutConfig ?? null;
    const captionConfig = body.caption_config ?? body.captionConfig ?? null;
    const hookConfig = body.hook_config ?? body.hookConfig ?? null;
    const renderConfig = body.render_config ?? body.renderConfig ?? null;

    // Upsert clip_edits (one row per clip; replace the latest).
    const [existing] = await db
      .select()
      .from(clipEdits)
      .where(eq(clipEdits.clip_id, clipId))
      .orderBy(desc(clipEdits.updated_at))
      .limit(1);

    let savedEdit;
    if (existing) {
      [savedEdit] = await db
        .update(clipEdits)
        .set({
          layout_config: layoutConfig,
          caption_config: captionConfig,
          hook_config: hookConfig,
          render_config: renderConfig,
          updated_at: new Date().toISOString(),
        })
        .where(eq(clipEdits.id, existing.id))
        .returning();
    } else {
      [savedEdit] = await db
        .insert(clipEdits)
        .values({
          clip_id: clipId,
          layout_config: layoutConfig,
          caption_config: captionConfig,
          hook_config: hookConfig,
          render_config: renderConfig,
        })
        .returning();
    }

    // Sync overlay layers: replace strategy.
    const overlays = Array.isArray(body.overlays) ? body.overlays : [];
    const incomingIds = new Set(
      overlays.map((o: any) => o.id).filter((id: unknown) => typeof id === 'string')
    );

    // Delete overlays that are no longer present (and their keyframes).
    const currentOverlays = await db
      .select()
      .from(overlayLayers)
      .where(eq(overlayLayers.clip_id, clipId));
    for (const layer of currentOverlays) {
      if (!incomingIds.has(String(layer.id))) {
        await db
          .delete(trackingKeyframes)
          .where(eq(trackingKeyframes.overlay_layer_id, layer.id));
        await db.delete(overlayLayers).where(eq(overlayLayers.id, layer.id));
      }
    }

    // Insert/update the incoming overlays.
    for (const overlay of overlays) {
      const cfg = overlay.config ?? null;
      if (overlay.id) {
        await db
          .update(overlayLayers)
          .set({
            type: overlay.type,
            start_time: overlay.start_time ?? overlay.startTime ?? 0,
            end_time: overlay.end_time ?? overlay.endTime ?? 0,
            z_index: overlay.z_index ?? overlay.zIndex ?? 0,
            config: cfg,
            updated_at: new Date().toISOString(),
          })
          .where(eq(overlayLayers.id, overlay.id));
      } else {
        await db.insert(overlayLayers).values({
          clip_id: clipId,
          type: overlay.type,
          start_time: overlay.start_time ?? overlay.startTime ?? 0,
          end_time: overlay.end_time ?? overlay.endTime ?? 0,
          z_index: overlay.z_index ?? overlay.zIndex ?? 0,
          config: cfg,
        });
      }
    }

    return NextResponse.json({
      data: {
        clipId,
        edit: savedEdit,
        overlayCount: overlays.length,
      },
      meta: { saved: true },
    });
  } catch (error) {
    console.error('Failed to save clip edit:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SAVE_CLIP_EDIT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to save clip edit',
        },
      },
      { status: 500 }
    );
  }
}
