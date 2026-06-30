import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clipEdits, clipReframeConfigs, clips } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

const defaultSafeArea = { caption: true, hook: true };

export async function GET(
  request: NextRequest,
  { params }: { params: { clipId: string } }
) {
  try {
    const [clip] = await db
      .select()
      .from(clips)
      .where(eq(clips.clip_id, params.clipId))
      .limit(1);

    if (!clip?.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    const [config] = await db
      .select()
      .from(clipReframeConfigs)
      .where(eq(clipReframeConfigs.clip_id, clip.clip_id))
      .orderBy(desc(clipReframeConfigs.updated_at))
      .limit(1);

    return NextResponse.json({
      data: {
        clipId: clip.clip_id,
        reframe: config ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to fetch reframe config:', error);
    return NextResponse.json(
      {
        error: {
          code: 'FETCH_REFRAME_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch reframe config',
        },
      },
      { status: 500 }
    );
  }
}

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

    if (!clip?.clip_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Clip not found' } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const mode = body.mode ?? body.reframeMode ?? 'face-center-crop';
    const fallbackMode = body.fallbackMode ?? 'fit-blur';
    const manualKeyframes = body.manualKeyframes ?? [];
    const safeArea = body.safeArea ?? defaultSafeArea;

    const [existing] = await db
      .select()
      .from(clipReframeConfigs)
      .where(eq(clipReframeConfigs.clip_id, clip.clip_id))
      .orderBy(desc(clipReframeConfigs.updated_at))
      .limit(1);

    const values = {
      mode,
      fallback_mode: fallbackMode,
      aspect_ratio: '9:16',
      output_width: Number(body.outputWidth ?? 1080),
      output_height: Number(body.outputHeight ?? 1920),
      manual_keyframes: manualKeyframes,
      safe_area_config: safeArea,
      updated_at: new Date().toISOString(),
    };

    const [saved] = existing
      ? await db
          .update(clipReframeConfigs)
          .set(values)
          .where(eq(clipReframeConfigs.id, existing.id))
          .returning()
      : await db
          .insert(clipReframeConfigs)
          .values({
            clip_id: clip.clip_id,
            ...values,
            face_detections: [],
            person_detections: [],
            selected_subjects: [],
            crop_boxes: [],
            smoothed_crop_boxes: [],
          })
          .returning();

    const [edit] = await db
      .select()
      .from(clipEdits)
      .where(eq(clipEdits.clip_id, clip.clip_id))
      .orderBy(desc(clipEdits.updated_at))
      .limit(1);

    const layoutConfig = {
      ...(edit?.layout_config && typeof edit.layout_config === 'object' ? edit.layout_config : {}),
      mode: mode === 'fit-blur' ? 'fit' : mode === 'manual-crop' ? 'crop' : 'full',
      aspectRatio: '9:16',
      reframeMode: mode,
      fallbackMode,
      manualKeyframes,
    };

    if (edit) {
      await db
        .update(clipEdits)
        .set({ layout_config: layoutConfig, updated_at: new Date().toISOString() })
        .where(eq(clipEdits.id, edit.id));
    } else {
      await db.insert(clipEdits).values({
        clip_id: clip.clip_id,
        layout_config: layoutConfig,
        caption_config: null,
        hook_config: null,
        render_config: null,
      });
    }

    return NextResponse.json({ data: { clipId: clip.clip_id, reframe: saved } });
  } catch (error) {
    console.error('Failed to update reframe config:', error);
    return NextResponse.json(
      {
        error: {
          code: 'UPDATE_REFRAME_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update reframe config',
        },
      },
      { status: 500 }
    );
  }
}
