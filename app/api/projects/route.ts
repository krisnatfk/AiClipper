import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { createClipProject } from '@/lib/opus/opusClient';
import type { CreateProjectPayload } from '@/types';
import { desc, sql } from 'drizzle-orm';

/**
 * Validate video URL format
 */
function isValidVideoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Support common video platforms
    const validHosts = [
      'youtube.com',
      'youtu.be',
      'vimeo.com',
      'facebook.com',
      'instagram.com',
      'tiktok.com',
      'twitter.com',
      'x.com',
    ];
    return validHosts.some(host => parsedUrl.hostname.includes(host));
  } catch {
    return false;
  }
}

/**
 * GET /api/projects
 * Get all projects with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage');
    const search = searchParams.get('search');

    let query = db.select().from(projects);

    // Filter by stage
    if (stage && stage !== 'ALL') {
      if (stage === 'FAILED') {
        // Include both FAILED and STALLED as failed
        query = query.where(
          sql`${projects.stage} IN ('FAILED', 'STALLED')`
        );
      } else {
        query = query.where(sql`${projects.stage} = ${stage}`);
      }
    }

    // Search by title or project_id
    if (search) {
      query = query.where(
        sql`${projects.title} LIKE ${`%${search}%`} OR ${projects.project_id} LIKE ${`%${search}%`}`
      );
    }

    const allProjects = await query.orderBy(desc(projects.created_at));

    return NextResponse.json({
      data: allProjects,
      meta: {
        total: allProjects.length,
        filter: { stage, search },
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

/**
 * POST /api/projects
 * Create a new project with validation and safe defaults
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.videoUrl) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'videoUrl is required',
          },
        },
        { status: 400 }
      );
    }

    // Validate video URL format
    if (!isValidVideoUrl(body.videoUrl)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid video URL. Please provide a valid YouTube, Vimeo, TikTok, or social media video URL.',
          },
        },
        { status: 400 }
      );
    }

    // Build OpusClip API payload with safe defaults
    const payload: CreateProjectPayload = {
      videoUrl: body.videoUrl,
    };

    // Add title
    if (body.title) {
      payload.uploadedVideoAttr = {
        title: body.title,
      };
    }

    // Build curation preferences
    const curationPref: CreateProjectPayload['curationPref'] = {
      model: body.model || 'ClipAnything', // Safer default: ClipAnything
    };

    // Genre
    if (body.genre) {
      curationPref.genre = body.genre;
    }

    // Topic keywords (for ClipBasic)
    if (body.topicKeywords) {
      const keywords = typeof body.topicKeywords === 'string'
        ? body.topicKeywords.split(',').map((k: string) => k.trim()).filter(Boolean)
        : body.topicKeywords;

      if (keywords.length > 0) {
        curationPref.topicKeywords = keywords;
      }
    }

    // Custom prompt (for ClipAnything)
    if (body.customPrompt && curationPref.model === 'ClipAnything') {
      curationPref.customPrompt = body.customPrompt;
    }

    // Clip duration
    if (body.clipDurationMin !== undefined || body.clipDurationMax !== undefined) {
      const min = body.clipDurationMin ?? 30;
      const max = body.clipDurationMax ?? 90;
      curationPref.clipDurations = [[min, max]];
    }

    // Video range - only add if meaningful values provided
    if (body.rangeStartSec !== undefined && body.rangeEndSec !== undefined) {
      const startSec = body.rangeStartSec ?? 0;
      const endSec = body.rangeEndSec ?? 0;

      // Only add range if endSec > startSec (meaningful range)
      if (endSec > startSec) {
        curationPref.range = {
          startSec,
          endSec,
        };
      }
    }

    // Add curationPref to payload
    payload.curationPref = curationPref;

    // Build render preferences
    const renderPref: CreateProjectPayload['renderPref'] = {};

    if (body.layoutAspectRatio) {
      renderPref.layoutAspectRatio = body.layoutAspectRatio;
    }

    // Caption settings
    if (body.enableCaption !== undefined) {
      renderPref.enableCaption = body.enableCaption;
    }

    if (body.enableEmoji !== undefined) {
      renderPref.enableEmoji = body.enableEmoji;
    }

    if (body.enableHighlight !== undefined) {
      renderPref.enableHighlight = body.enableHighlight;
    }

    if (body.enableUppercase !== undefined) {
      renderPref.enableUppercase = body.enableUppercase;
    }

    // Quickstart config
    if (body.enableRemoveFillerWords !== undefined) {
      renderPref.quickstartConfig = {
        enableRemoveFillerWords: body.enableRemoveFillerWords,
      };
    }

    // Only add renderPref if it has properties
    if (Object.keys(renderPref).length > 0) {
      payload.renderPref = renderPref;
    }

    // Import preferences
    if (body.sourceLang) {
      payload.importPref = {
        sourceLang: body.sourceLang,
      };
    }

    // Brand template
    if (body.brandTemplateId) {
      payload.brandTemplateId = body.brandTemplateId;
    }

    // Call OpusClip API
    const opusProject = await createClipProject(payload);

    // Save to database
    const [newProject] = await db.insert(projects).values({
      project_id: opusProject.id,
      org_id: opusProject.orgId,
      user_id: opusProject.userId,
      title: body.title || opusProject.title || 'Untitled Project',
      source_platform: opusProject.sourcePlatform,
      source_id: opusProject.sourceId,
      source_uri: opusProject.sourceUri,
      video_url: body.videoUrl,
      model: curationPref.model,
      genre: body.genre || opusProject.genre || 'Auto',
      stage: opusProject.stage || 'PENDING',
      visibility: opusProject.visibility,
      storage_size: opusProject.storageSize,
      storage_status: opusProject.storageStatus,
      storage_expire_at: opusProject.storageExpireAt,
      curation_pref: payload.curationPref,
      render_pref: payload.renderPref,
      import_pref: payload.importPref,
      raw_response: opusProject,
    }).returning();

    return NextResponse.json(
      {
        data: newProject,
        meta: {
          opusProjectId: opusProject.id,
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
          details: error instanceof Error ? error.stack : undefined,
        },
      },
      { status: 500 }
    );
  }
}
