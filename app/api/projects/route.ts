import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { logProcessingEvent } from '@/lib/logs/processingLogger';
import { desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { extractYouTubeVideoId, isYouTubeUrl, normalizeYouTubeUrl } from '@/lib/video/youtubeUrl';

/**
 * Detect known platform URLs (YouTube/TikTok/Instagram/etc.). The MVP only
 * processes direct video file URLs (spec B). Platform URLs must surface a
 * clear "coming soon" message instead of crashing.
 */
const PLATFORM_HOST_PATTERNS = [
  /(?:^|\.)(youtube\.com|youtu\.be)$/i,
  /(?:^|\.)(tiktok\.com)$/i,
  /(?:^|\.)(instagram\.com)$/i,
  /(?:^|\.)(facebook\.com|fb\.watch)$/i,
  /(?:^|\.)(vimeo\.com)$/i,
  /(?:^|\.)(twitter\.com|x\.com)$/i,
  /(?:^|\.)(dailymotion\.com)$/i,
];

function isDirectVideoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return false;
    return /\.(mp4|mov|m4v|webm|mkv)(\?.*)?$/i.test(parsedUrl.pathname + parsedUrl.search);
  } catch {
    return false;
  }
}

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const pattern of PLATFORM_HOST_PATTERNS) {
      if (pattern.test(host)) return host;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

function toAspectRatio(value: unknown): '9:16' | '1:1' | '16:9' | '4:5' {
  if (value === '1:1' || value === '16:9' || value === '4:5') return value;
  return '9:16';
}

function toProcessingMode(value: unknown): 'fast' | 'balanced' | 'quality' {
  if (value === 'fast' || value === 'quality') return value;
  return 'balanced';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || searchParams.get('stage');
    const search = searchParams.get('search');

    let query = db.select().from(projects);

    if (status && status !== 'ALL') {
      if (status === 'FAILED') {
        query = query.where(sql`${projects.status} IN ('FAILED', 'PARTIAL_COMPLETED') OR ${projects.stage} IN ('FAILED', 'STALLED')`) as any;
      } else {
        query = query.where(sql`${projects.status} = ${status} OR ${projects.stage} = ${status}`) as any;
      }
    }

    if (search) {
      query = query.where(
        sql`${projects.title} LIKE ${`%${search}%`} OR ${projects.project_id} LIKE ${`%${search}%`}`
      ) as any;
    }

    const allProjects = await query.orderBy(desc(projects.created_at));

    return NextResponse.json({
      data: allProjects,
      meta: {
        total: allProjects.length,
        filter: { status, search },
      },
    });
  } catch (error) {
    console.error('Failed to fetch projects:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_PROJECTS_ERROR',
          message: 'Failed to fetch projects',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const videoUrl = String(body.videoUrl || body.sourceUrl || '').trim();

    if (!videoUrl) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'videoUrl is required for direct URL projects. Use /api/uploads/video for local file upload.',
          },
        },
        { status: 400 }
      );
    }

    // YouTube URLs are handled by the worker via yt-dlp. Check them first
    // before falling back to direct URL / upload flows.
    if (isYouTubeUrl(videoUrl)) {
      const videoId = extractYouTubeVideoId(videoUrl);
      if (!videoId) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_YOUTUBE_URL',
              message: 'The URL looks like YouTube but we could not extract a video ID. Please check the link.',
            },
          },
          { status: 400 }
        );
      }

      const normalizedUrl = normalizeYouTubeUrl(videoId);
      const projectId = `proj_${randomUUID()}`;

      const [project] = await db
        .insert(projects)
        .values({
          project_id: projectId,
          title: body.title || 'Untitled YouTube Project',
          source_type: 'youtube',
          source_url: normalizedUrl,
          video_url: normalizedUrl,
          status: 'SOURCE_READY',
          stage: 'SOURCE_READY',
          progress: 5,
          current_step: 'YouTube source ready. Configure the project to start processing.',
          language: body.sourceLang || body.language || 'id',
          clip_count_requested: Number(body.clipCount ?? process.env.DEFAULT_CLIP_COUNT ?? 5),
          clip_min_seconds: Number(body.clipMinSeconds ?? body.clipDurationMin ?? process.env.DEFAULT_CLIP_MIN_SECONDS ?? 30),
          clip_max_seconds: Number(body.clipMaxSeconds ?? body.clipDurationMax ?? process.env.DEFAULT_CLIP_MAX_SECONDS ?? 90),
          aspect_ratio: toAspectRatio(body.aspectRatio),
          processing_mode: toProcessingMode(body.processingMode),
          clipping_mode: 'ai_clipping',
          auto_hook_enabled: true,
          ai_provider: 'gemini',
          transcription_engine: process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
          model: 'Auto',
          genre: 'Auto',
          caption_template_id: 'big-white',
          render_template_id: 'big-white',
          render_pref: {
            captionEnabled: true,
            hookEnabled: true,
            aspectRatio: toAspectRatio(body.aspectRatio),
            captionTemplateId: 'big-white',
            renderTemplateId: 'big-white',
            captionSettings: {
              uppercase: true,
              maxWordsPerCaption: 2,
              position: 'bottom-center',
              fontSize: 64,
              fontWeight: 900,
              textColor: '#FFFFFF',
              strokeColor: '#000000',
              strokeWidth: 8,
              shadow: true,
              animation: 'pop',
            },
          },
          curation_pref: { promptPreset: 'Auto', customPrompt: '' },
          import_pref: { sourceLang: body.sourceLang || body.language || 'id' },
        })
        .returning();

      await logProcessingEvent({
        projectId,
        step: 'CREATE',
        message: 'YouTube URL added. Source download queued.',
        meta: { sourceUrl: normalizedUrl, videoId },
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
    }

    // Platform URLs are not yet supported by the self-processing worker
    // (spec B). Surface a clear "coming soon" error instead of crashing.
    const platform = detectPlatform(videoUrl);
    if (platform) {
      return NextResponse.json(
        {
          error: {
            code: 'PLATFORM_NOT_SUPPORTED',
            message: `${platform} links are not supported yet. Direct video URL supported. YouTube/TikTok support coming soon.`,
          },
        },
        { status: 400 }
      );
    }

    if (!isDirectVideoUrl(videoUrl)) {
      return NextResponse.json(
        {
          error: {
            code: 'DIRECT_URL_ONLY',
            message: 'Direct video URL supported. YouTube/TikTok support coming soon. Please paste a direct .mp4/.mov/.webm URL, or upload a local video.',
          },
        },
        { status: 400 }
      );
    }

    // Draft-first flow (decision D1 / spec B): direct-URL projects start in
    // DRAFT state. The worker is NOT enqueued here — the user configures on
    // /projects/:id/configure and then hits POST /api/projects/:id/start.
    const projectId = `proj_${randomUUID()}`;

    const [project] = await db
      .insert(projects)
      .values({
        project_id: projectId,
        title: body.title || 'Untitled Project',
        source_type: 'direct_url',
        source_url: videoUrl,
        video_url: videoUrl,
        status: 'DRAFT',
        stage: 'DRAFT',
        progress: 0,
        current_step: 'Direct URL added. Configure the project to start processing.',
        language: body.sourceLang || body.language || 'id',
        clip_count_requested: Number(body.clipCount ?? process.env.DEFAULT_CLIP_COUNT ?? 5),
        clip_min_seconds: Number(body.clipMinSeconds ?? body.clipDurationMin ?? process.env.DEFAULT_CLIP_MIN_SECONDS ?? 30),
        clip_max_seconds: Number(body.clipMaxSeconds ?? body.clipDurationMax ?? process.env.DEFAULT_CLIP_MAX_SECONDS ?? 90),
        aspect_ratio: toAspectRatio(body.aspectRatio),
        processing_mode: toProcessingMode(body.processingMode),
        clipping_mode: 'ai_clipping',
        auto_hook_enabled: true,
        ai_provider: 'gemini',
        transcription_engine: process.env.TRANSCRIBE_ENGINE || 'faster-whisper',
        model: 'Auto',
        genre: 'Auto',
        caption_template_id: 'big-white',
        render_template_id: 'big-white',
        render_pref: {
          captionEnabled: true,
          hookEnabled: true,
          aspectRatio: toAspectRatio(body.aspectRatio),
          captionTemplateId: 'big-white',
          renderTemplateId: 'big-white',
          captionSettings: {
            uppercase: true,
            maxWordsPerCaption: 2,
            position: 'bottom-center',
            fontSize: 64,
            fontWeight: 900,
            textColor: '#FFFFFF',
            strokeColor: '#000000',
            strokeWidth: 8,
            shadow: true,
            animation: 'pop',
          },
        },
        curation_pref: { promptPreset: 'Auto', customPrompt: '' },
        import_pref: { sourceLang: body.sourceLang || body.language || 'id' },
      })
      .returning();

    await logProcessingEvent({
      projectId,
      step: 'CREATE',
      message: 'Direct video URL added. Awaiting configuration before processing.',
      meta: { sourceUrl: videoUrl },
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
    console.error('Failed to create project:', error);

    return NextResponse.json(
      {
        error: {
          code: 'CREATE_PROJECT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create project',
        },
      },
      { status: 500 }
    );
  }
}
