import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { createClipProject } from '@/lib/opus/opusClient';
import type { CreateProjectPayload } from '@/types';
import { desc } from 'drizzle-orm';

/**
 * GET /api/projects
 * Get all projects
 */
export async function GET(request: NextRequest) {
  try {
    const allProjects = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.created_at));

    return NextResponse.json({
      data: allProjects,
      meta: {
        total: allProjects.length,
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
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
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

    // Build OpusClip API payload
    const payload: CreateProjectPayload = {
      videoUrl: body.videoUrl,
    };

    // Add optional fields
    if (body.title) {
      payload.uploadedVideoAttr = {
        title: body.title,
      };
    }

    // Curation preferences
    if (body.model || body.genre || body.topicKeywords || body.clipDurationMin || body.clipDurationMax || body.rangeStartSec || body.rangeEndSec) {
      payload.curationPref = {
        model: body.model || 'ClipBasic',
      };

      if (body.genre) {
        payload.curationPref.genre = body.genre;
      }

      if (body.topicKeywords) {
        const keywords = typeof body.topicKeywords === 'string'
          ? body.topicKeywords.split(',').map((k: string) => k.trim()).filter(Boolean)
          : body.topicKeywords;

        if (keywords.length > 0) {
          payload.curationPref.topicKeywords = keywords;
        }
      }

      if (body.customPrompt && body.model === 'ClipAnything') {
        payload.curationPref.customPrompt = body.customPrompt;
      }

      if (body.clipDurationMin !== undefined || body.clipDurationMax !== undefined) {
        const min = body.clipDurationMin || 0;
        const max = body.clipDurationMax || 90;
        payload.curationPref.clipDurations = [[min, max]];
      }

      if (body.rangeStartSec !== undefined || body.rangeEndSec !== undefined) {
        payload.curationPref.range = {
          startSec: body.rangeStartSec || 0,
          endSec: body.rangeEndSec || 0,
        };
      }
    }

    // Render preferences
    if (body.layoutAspectRatio || body.enableRemoveFillerWords || body.enableCaption || body.enableEmoji || body.enableHighlight || body.enableUppercase) {
      payload.renderPref = {};

      if (body.layoutAspectRatio) {
        payload.renderPref.layoutAspectRatio = body.layoutAspectRatio;
      }

      if (body.enableRemoveFillerWords || body.enableCaption || body.enableEmoji || body.enableHighlight || body.enableUppercase) {
        payload.renderPref.quickstartConfig = {};

        if (body.enableRemoveFillerWords) {
          payload.renderPref.quickstartConfig.enableRemoveFillerWords = true;
        }
      }

      if (body.enableCaption) {
        payload.renderPref.enableCaption = true;
      }

      if (body.enableEmoji) {
        payload.renderPref.enableEmoji = true;
      }

      if (body.enableHighlight) {
        payload.renderPref.enableHighlight = true;
      }

      if (body.enableUppercase) {
        payload.renderPref.enableUppercase = true;
      }
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
      model: body.model || 'ClipBasic',
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
