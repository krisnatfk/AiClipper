import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { saveUploadedVideo } from '@/lib/storage/local';
import { logProcessingEvent } from '@/lib/logs/processingLogger';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

/**
 * POST /api/uploads/video
 *
 * Step 1 of the new draft-first flow (decision D1 / spec B). This endpoint ONLY
 * persists the uploaded file and creates a project in UPLOADED state. It does
 * NOT enqueue any processing job — the user must configure the project on
 * /projects/:id/configure and then hit POST /api/projects/:id/start.
 *
 * Accepted multipart fields:
 *  - file:      the video file (required)
 *  - title:     optional project title
 *  - language:  optional speech language hint (auto | id | en | <code>)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Video file is required.',
          },
        },
        { status: 400 }
      );
    }

    const projectId = `proj_${randomUUID()}`;
    const title = String(formData.get('title') || file.name || 'Untitled Project');
    const language = String(formData.get('language') || 'auto');

    const savedVideo = await saveUploadedVideo(file, projectId);

    const [project] = await db
      .insert(projects)
      .values({
        project_id: projectId,
        title,
        source_type: 'upload',
        source_file_path: savedVideo.relativePath,
        video_url: savedVideo.relativePath,
        // Draft-first: stay UPLOADED until the user configures + starts (spec B/C).
        status: 'UPLOADED',
        stage: 'UPLOADED',
        progress: 5,
        current_step: 'Video uploaded. Configure the project to start processing.',
        file_size: savedVideo.size,
        storage_size: savedVideo.size,
        language,
        clip_count_requested: 5,
        clip_min_seconds: 30,
        clip_max_seconds: 90,
        aspect_ratio: '9:16',
        processing_mode: 'balanced',
        clipping_mode: 'ai_clipping',
        auto_hook_enabled: true,
        ai_provider: 'gemini',
        transcription_engine: process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
        model: 'Smart Mode',
        genre: 'Auto',
        render_pref: { captionEnabled: true, hookEnabled: true, aspectRatio: '9:16' },
        curation_pref: { promptPreset: 'Auto', customPrompt: '' },
        import_pref: { sourceLang: language },
      })
      .returning();

    await logProcessingEvent({
      projectId,
      step: 'UPLOAD',
      message: 'Video uploaded. Awaiting configuration before processing.',
      meta: {
        fileSize: savedVideo.size,
        storagePath: savedVideo.relativePath,
      },
    });

    return NextResponse.json(
      {
        data: project,
        meta: {
          nextStep: 'configure',
          configureUrl: `/projects/${projectId}/configure`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to upload video:', error);

    return NextResponse.json(
      {
        error: {
          code: 'UPLOAD_VIDEO_ERROR',
          message: error instanceof Error ? error.message : 'Failed to upload video.',
        },
      },
      { status: 500 }
    );
  }
}
