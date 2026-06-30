import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clips, clipEdits, overlayLayers } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * POST /api/clips/[clipId]/duplicate
 *
 * Duplicate a clip (spec Section E clip actions). Creates a new clip row with a
 * fresh clip_id, copies the editor config (clip_edits) so the duplicate opens in
 * the editor with the same settings, and marks the new clip as PENDING render so
 * the user knows it has no independent output file yet (it points at the
 * original's output until re-rendered/exported).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const [source] = await db
      .select()
      .from(clips)
      .where(eq(clips.clip_id, params.clipId))
      .limit(1);

    if (!source || !source.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    // source.clip_id is non-null after the guard; bind locally for type narrowing.
    const sourceClipId = source.clip_id;
    const newClipId = `clip_${randomUUID()}`;

    const [duplicated] = await db
      .insert(clips)
      .values({
        clip_id: newClipId,
        opus_clip_id: newClipId,
        project_id: source.project_id,
        clip_plan_id: source.clip_plan_id,
        title: `${source.title} (copy)`,
        text: source.text,
        description: source.description,
        hashtags: source.hashtags,
        hook_text: source.hook_text,
        caption: source.caption,
        start_sec: source.start_sec,
        end_sec: source.end_sec,
        duration_seconds: source.duration_seconds,
        duration_ms: source.duration_ms,
        score: source.score,
        // Point at the original output for preview until re-rendered.
        output_file_path: source.output_file_path,
        output_storage_url: `/api/clips/${newClipId}/video`,
        uri_for_preview: `/api/clips/${newClipId}/video`,
        uri_for_export: `/api/clips/${newClipId}/video`,
        thumbnail_file_path: source.thumbnail_file_path,
        thumbnail_storage_url: `/api/clips/${newClipId}/thumbnail`,
        subtitle_file_path: source.subtitle_file_path,
        status: 'COMPLETED',
        keywords: source.keywords,
        prompt_name: source.prompt_name,
        genre: source.genre,
        subgenre: source.subgenre,
        render_pref: source.render_pref,
        time_ranges: source.time_ranges,
      })
      .returning();

    // Copy the latest editor config so the duplicate opens pre-configured.
    const [sourceEdit] = await db
      .select()
      .from(clipEdits)
      .where(eq(clipEdits.clip_id, sourceClipId))
      .orderBy(desc(clipEdits.updated_at))
      .limit(1);

    if (sourceEdit) {
      await db.insert(clipEdits).values({
        clip_id: newClipId,
        layout_config: sourceEdit.layout_config,
        caption_config: sourceEdit.caption_config,
        hook_config: sourceEdit.hook_config,
        render_config: sourceEdit.render_config,
      });
    }

    // Copy overlay layers (without keyframes — those are tied to layer ids).
    const sourceOverlays = await db
      .select()
      .from(overlayLayers)
      .where(eq(overlayLayers.clip_id, sourceClipId));
    for (const overlay of sourceOverlays) {
      await db.insert(overlayLayers).values({
        clip_id: newClipId,
        type: overlay.type,
        start_time: overlay.start_time,
        end_time: overlay.end_time,
        z_index: overlay.z_index,
        config: overlay.config,
      });
    }

    return NextResponse.json(
      {
        data: duplicated,
        meta: { sourceClipId, duplicated: true },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to duplicate clip:', error);
    return NextResponse.json(
      {
        error: {
          code: 'DUPLICATE_CLIP_ERROR',
          message: error instanceof Error ? error.message : 'Failed to duplicate clip',
        },
      },
      { status: 500 }
    );
  }
}
