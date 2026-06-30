import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/projects/[projectId]/diagnose
 * Diagnostic endpoint to test OpusClip API responses for a specific project
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
            message: 'Project not found in database',
          },
        },
        { status: 404 }
      );
    }

    const OPUS_API_KEY = process.env.OPUS_API_KEY;
    const OPUS_API_BASE_URL = process.env.OPUS_API_BASE_URL || 'https://api.opus.pro';
    const OPUS_ORG_ID = process.env.OPUS_ORG_ID;

    if (!OPUS_API_KEY) {
      return NextResponse.json({
        error: 'OPUS_API_KEY not configured',
        databaseProject: {
          project_id: project.project_id,
          stage: project.stage,
          title: project.title,
          created_at: project.created_at,
          updated_at: project.updated_at,
        },
      });
    }

    const headers: HeadersInit = {
      'Authorization': `Bearer ${OPUS_API_KEY}`,
      'Content-Type': 'application/json',
      ...(OPUS_ORG_ID && { 'x-opus-org-id': OPUS_ORG_ID }),
    };

    // Test 1: Try all 3 project status endpoints
    const projectEndpoints = [
      `/api/clip-projects/${projectId}`,
      `/api/clip-projects?q=findById&id=${encodeURIComponent(projectId)}`,
      `/api/clip-projects?q=findByProjectId&projectId=${encodeURIComponent(projectId)}`,
    ];

    const projectResults = [];

    for (const endpoint of projectEndpoints) {
      const url = `${OPUS_API_BASE_URL}${endpoint}`;
      try {
        const response = await fetch(url, { headers });
        const text = await response.text();
        let data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }

        projectResults.push({
          endpoint,
          url,
          status: response.status,
          statusText: response.statusText,
          success: response.ok,
          data,
        });
      } catch (error) {
        projectResults.push({
          endpoint,
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Test 2: Try fetching exportable clips
    const clipsUrl = `${OPUS_API_BASE_URL}/api/exportable-clips?q=findByProjectId&projectId=${projectId}&pageNum=1&pageSize=50`;
    let clipsResult;

    try {
      const response = await fetch(clipsUrl, { headers });
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      clipsResult = {
        url: clipsUrl,
        status: response.status,
        statusText: response.statusText,
        success: response.ok,
        data,
        clipsCount: Array.isArray(data) ? data.length : 0,
      };
    } catch (error) {
      clipsResult = {
        url: clipsUrl,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    return NextResponse.json({
      diagnostic: {
        timestamp: new Date().toISOString(),
        projectId,
        config: {
          apiBaseUrl: OPUS_API_BASE_URL,
          apiKeyConfigured: !!OPUS_API_KEY,
          apiKeyPrefix: OPUS_API_KEY ? OPUS_API_KEY.substring(0, 10) + '...' : null,
          orgIdConfigured: !!OPUS_ORG_ID,
        },
        databaseProject: {
          project_id: project.project_id,
          stage: project.stage,
          title: project.title,
          model: project.model,
          created_at: project.created_at,
          updated_at: project.updated_at,
        },
        opusApiTests: {
          projectStatus: projectResults,
          exportableClips: clipsResult,
        },
        summary: {
          anyProjectEndpointSucceeded: projectResults.some(r => r.success),
          clipsEndpointSucceeded: clipsResult?.success || false,
          databaseStageIsStale: project.stage === 'QUEUED' || project.stage === 'PENDING',
        },
      },
    });
  } catch (error) {
    console.error('Diagnostic error:', error);

    return NextResponse.json(
      {
        error: {
          code: 'DIAGNOSTIC_ERROR',
          message: error instanceof Error ? error.message : 'Diagnostic failed',
          details: error instanceof Error ? error.stack : undefined,
        },
      },
      { status: 500 }
    );
  }
}
