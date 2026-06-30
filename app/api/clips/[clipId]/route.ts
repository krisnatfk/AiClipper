import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  clips,
  clipEdits,
  clipReframeConfigs,
  overlayLayers,
  trackingKeyframes,
  subtitleSegments,
  projects,
  renderTemplates,
} from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { rm } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

async function findClipByClipId(clipId: string) {
  const [clip] = await db
    .select()
    .from(clips)
    .where(eq(clips.clip_id, clipId))
    .limit(1);
  return clip;
}

/**
 * GET /api/clips/[clipId]
 *
 * Clip detail for the editor (spec Section F). Returns the clip, its latest
 * clip_edits row (caption/hook/layout/render config), overlay layers +
 * tracking keyframes, subtitle segments, and the resolved caption template
 * (if the project has one selected). This is the single hydration payload the
 * editor loads on mount.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const clip = await findClipByClipId(params.clipId);
    if (!clip || !clip.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    // clip.clip_id is non-null after the guard; bind locally for type narrowing.
    const clipId = clip.clip_id;

    const [editRow] = await db
      .select()
      .from(clipEdits)
      .where(eq(clipEdits.clip_id, clipId))
      .orderBy(desc(clipEdits.updated_at))
      .limit(1);

    const [reframeRow] = await db
      .select()
      .from(clipReframeConfigs)
      .where(eq(clipReframeConfigs.clip_id, clipId))
      .orderBy(desc(clipReframeConfigs.updated_at))
      .limit(1);

    const overlayRows = await db
      .select()
      .from(overlayLayers)
      .where(eq(overlayLayers.clip_id, clipId));

    // tracking keyframes join through overlay_layer_id (integer).
    const overlayIds = overlayRows.map((o) => o.id);
    let keyframes: typeof trackingKeyframes.$inferSelect[] = [];
    if (overlayIds.length > 0) {
      keyframes = await db
        .select()
        .from(trackingKeyframes)
        .where(eq(trackingKeyframes.overlay_layer_id, overlayIds[0]));
    }

    const subtitleRows = await db
      .select()
      .from(subtitleSegments)
      .where(eq(subtitleSegments.clip_id, clipId));

    // Resolve the project (for source path + caption template).
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, clip.project_id))
      .limit(1);

    let captionTemplate: typeof renderTemplates.$inferSelect | null = null;
    if (project?.caption_template_id) {
      const [tmpl] = await db
        .select()
        .from(renderTemplates)
        .where(eq(renderTemplates.template_id, project.caption_template_id))
        .limit(1);
      captionTemplate = tmpl ?? null;
    }

    return NextResponse.json({
      data: {
        clip,
        project,
        edit: editRow ?? null,
        reframe: reframeRow ?? null,
        overlays: overlayRows,
        keyframes,
        subtitles: subtitleRows,
        captionTemplate,
      },
    });
  } catch (error) {
    console.error('Failed to fetch clip:', error);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_CLIP_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch clip',
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/clips/[clipId]?delete_file=true
 *
 * Delete a clip (spec Section I). Removes the clip row plus its editor data
 * (clip_edits, overlay layers + their tracking keyframes, subtitle segments).
 * When delete_file=true, also removes the rendered output video, thumbnail and
 * subtitle files from storage. Returns the updated clip count for the project.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const deleteFile =
      new URL(request.url).searchParams.get('delete_file') === 'true';

    const clip = await findClipByClipId(params.clipId);
    if (!clip || !clip.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    // clip.clip_id is non-null after the guard; bind locally for type narrowing.
    const clipId = clip.clip_id;

    // 1. Drop tracking keyframes for this clip's overlay layers.
    const overlayRows = await db
      .select()
      .from(overlayLayers)
      .where(eq(overlayLayers.clip_id, clipId));
    for (const layer of overlayRows) {
      await db
        .delete(trackingKeyframes)
        .where(eq(trackingKeyframes.overlay_layer_id, layer.id));
    }

    // 2. Drop editor data keyed by clip_id.
    await db.delete(clipEdits).where(eq(clipEdits.clip_id, clipId));
    await db.delete(overlayLayers).where(eq(overlayLayers.clip_id, clipId));
    await db.delete(subtitleSegments).where(eq(subtitleSegments.clip_id, clipId));

    // 3. Optionally remove the rendered files.
    if (deleteFile) {
      const workspace = process.cwd();
      const safeDelete = async (relPath: string | null | undefined) => {
        if (!relPath) return;
        try {
          const abs = path.resolve(workspace, relPath);
          if (abs.toLowerCase().startsWith(workspace.toLowerCase())) {
            await rm(abs, { force: true, recursive: true });
          }
        } catch {
          /* best-effort */
        }
      };
      await safeDelete(clip.output_file_path);
      await safeDelete(clip.thumbnail_file_path);
      await safeDelete(clip.subtitle_file_path);
    }

    // 4. Finally delete the clip row.
    await db.delete(clips).where(eq(clips.clip_id, clip.clip_id));

    // 5. Report updated clip count for the project.
    const remaining = await db
      .select()
      .from(clips)
      .where(eq(clips.project_id, clip.project_id));

    return NextResponse.json({
      data: {
        clipId,
        deleted: true,
        deleteFile,
        remainingClipCount: remaining.length,
      },
    });
  } catch (error) {
    console.error('Failed to delete clip:', error);
    return NextResponse.json(
      {
        error: {
          code: 'DELETE_CLIP_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete clip',
        },
      },
      { status: 500 }
    );
  }
}
