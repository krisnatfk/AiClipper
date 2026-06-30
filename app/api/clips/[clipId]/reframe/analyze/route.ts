import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clipReframeConfigs, clips, projects } from '@/lib/db/schema';
import { analyzeReframe } from '@/lib/video/reframe/reframePipeline';
import { desc, eq } from 'drizzle-orm';
import path from 'path';

function resolveWorkspacePath(filePath: string) {
  const workspace = process.cwd();
  const absolutePath = path.resolve(workspace, filePath);
  if (!absolutePath.toLowerCase().startsWith(workspace.toLowerCase())) {
    throw new Error('Refusing to analyze a file path outside the workspace.');
  }
  return absolutePath;
}

export async function POST(
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

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, clip.project_id))
      .limit(1);

    if (!project?.source_file_path) {
      return NextResponse.json(
        { error: { code: 'SOURCE_NOT_READY', message: 'Project source file is not available locally yet.' } },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const mode = body.mode ?? body.reframeMode ?? 'face-center-crop';
    const startSec = Number(clip.start_sec ?? 0);
    const endSec = Number(clip.end_sec ?? Math.max(startSec + 1, project.duration_seconds ?? 60));
    const sourcePath = resolveWorkspacePath(project.source_file_path);

    const analysis = await analyzeReframe({
      sourcePath,
      startSec,
      endSec,
      mode,
      sampleInterval: Number(body.sampleInterval ?? 0.5),
    });

    const [existing] = await db
      .select()
      .from(clipReframeConfigs)
      .where(eq(clipReframeConfigs.clip_id, clip.clip_id))
      .orderBy(desc(clipReframeConfigs.updated_at))
      .limit(1);

    const values = {
      mode: analysis.mode,
      fallback_mode: analysis.fallbackMode,
      aspect_ratio: '9:16',
      output_width: analysis.outputWidth,
      output_height: analysis.outputHeight,
      face_detections: analysis.faceDetections,
      person_detections: analysis.personDetections,
      selected_subjects: analysis.selectedSubjects,
      crop_boxes: analysis.cropBoxes,
      smoothed_crop_boxes: analysis.smoothedCropBoxes,
      manual_keyframes: existing?.manual_keyframes ?? [],
      safe_area_config: existing?.safe_area_config ?? { caption: true, hook: true },
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
          .values({ clip_id: clip.clip_id, ...values })
          .returning();

    return NextResponse.json({
      data: {
        clipId: clip.clip_id,
        reframe: saved,
        tracked: analysis.tracked,
        mode: analysis.mode,
        sampledFrames: analysis.faceDetections.length,
      },
    });
  } catch (error) {
    console.error('Failed to analyze reframe:', error);
    return NextResponse.json(
      {
        error: {
          code: 'ANALYZE_REFRAME_ERROR',
          message: error instanceof Error ? error.message : 'Failed to analyze reframe',
        },
      },
      { status: 500 }
    );
  }
}
