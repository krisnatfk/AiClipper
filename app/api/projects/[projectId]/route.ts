import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getClipProject } from '@/lib/opus/opusClient';
import { eq } from 'drizzle-orm';

const TERMINAL_STAGES = new Set(['COMPLETE', 'STALLED', 'FAILED']);

/**
 * GET /api/projects/[projectId]
 * Get a single project by ID with best-effort OpusClip refresh
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;

    if (!projectId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Project ID is required',
          },
        },
        { status: 400 }
      );
    }

    // Fetch project from database
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.project_id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found',
          },
        },
        { status: 404 }
      );
    }

    // Skip refresh if project is in terminal stage
    if (TERMINAL_STAGES.has(project.stage)) {
      return NextResponse.json({
        data: project,
        meta: {
          isTerminal: true,
          stage: project.stage,
        },
      });
    }

    // Best-effort refresh from OpusClip for non-terminal projects
    try {
      const opusProject = await getClipProject(projectId);
      const [updatedProject] = await db
        .update(projects)
        .set({
          org_id: opusProject.orgId || project.org_id,
          user_id: opusProject.userId || project.user_id,
          title: opusProject.title || project.title,
          source_platform: opusProject.sourcePlatform || project.source_platform,
          source_id: opusProject.sourceId || project.source_id,
          source_uri: opusProject.sourceUri || project.source_uri,
          model: opusProject.model || project.model,
          genre: opusProject.genre || project.genre,
          stage: opusProject.stage || project.stage,
          visibility: opusProject.visibility || project.visibility,
          storage_size: opusProject.storageSize ?? project.storage_size,
          storage_status: opusProject.storageStatus || project.storage_status,
          storage_expire_at: opusProject.storageExpireAt || project.storage_expire_at,
          curation_pref: opusProject.curationPref || project.curation_pref,
          render_pref: opusProject.renderPref || project.render_pref,
          import_pref: opusProject.importPref || project.import_pref,
          raw_response: opusProject,
          updated_at: new Date().toISOString(),
        })
        .where(eq(projects.project_id, projectId))
        .returning();

      const returnedProject = updatedProject || project;
      const isNowTerminal = TERMINAL_STAGES.has(returnedProject.stage);

      return NextResponse.json({
        data: returnedProject,
        meta: {
          isTerminal: isNowTerminal,
          stage: returnedProject.stage,
          refreshed: true,
        },
      });
    } catch (statusError) {
      console.warn('Failed to refresh project status from OpusClip:', statusError);

      return NextResponse.json({
        data: project,
        meta: {
          isTerminal: false,
          stage: project.stage,
          refreshed: false,
          statusRefreshError: statusError instanceof Error ? statusError.message : 'Unknown status refresh error',
        },
      });
    }
  } catch (error) {
    console.error('Failed to fetch project:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_PROJECT_ERROR',
          message: 'Failed to fetch project',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
