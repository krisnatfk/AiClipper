import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, clips } from '@/lib/db/schema';
import { getExportableClips } from '@/lib/opus/opusClient';
import { eq } from 'drizzle-orm';

/**
 * POST /api/projects/[projectId]/sync-clips
 * Sync clips from OpusClip API for a project
 */
export async function POST(
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

    // Verify project exists in database
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

    // Fetch clips from OpusClip API
    const opusClips = await getExportableClips(projectId);

    if (!opusClips || opusClips.length === 0) {
      // Distinguish between STALLED/FAILED with 0 clips vs still processing
      const isTerminal = ['STALLED', 'FAILED', 'COMPLETE'].includes(project.stage);

      return NextResponse.json({
        data: {
          synced: 0,
          clips: [],
          projectStage: project.stage,
          status: isTerminal ? 'no_clips_rendered' : 'pending',
          message: isTerminal
            ? 'OpusClip could not render clips from this video. Credits are usually returned for failed projects.'
            : 'No clips available yet. The project is still processing.',
        },
      });
    }

    // Save clips to database with upsert logic
    let syncedCount = 0;
    const savedClips = [];

    for (const opusClip of opusClips) {
      try {
        // Check if clip already exists by opus_clip_id
        const [existingClip] = await db
          .select()
          .from(clips)
          .where(eq(clips.opus_clip_id, opusClip.id))
          .limit(1);

        if (existingClip) {
          // Update existing clip
          const [updatedClip] = await db
            .update(clips)
            .set({
              title: opusClip.title || existingClip.title,
              text: opusClip.text,
              description: opusClip.description,
              hashtags: opusClip.hashtags,
              keywords: opusClip.keywords,
              prompt_name: opusClip.promptName,
              genre: opusClip.genre,
              subgenre: opusClip.subgenre,
              duration_ms: opusClip.durationMs,
              storage_used: opusClip.storageUsed,
              time_ranges: opusClip.timeRanges,
              uri_for_preview: opusClip.uriForPreview,
              uri_for_export: opusClip.uriForExport,
              render_pref: opusClip.renderPref,
              raw_response: opusClip,
              updated_at: new Date().toISOString(),
            })
            .where(eq(clips.id, existingClip.id))
            .returning();

          savedClips.push(updatedClip);
        } else {
          // Insert new clip
          const [newClip] = await db
            .insert(clips)
            .values({
              opus_clip_id: opusClip.id,
              project_id: projectId,
              run_id: opusClip.runId,
              curation_id: opusClip.curationId,
              org_id: project.org_id,
              user_id: project.user_id,
              title: opusClip.title || 'Untitled Clip',
              text: opusClip.text,
              description: opusClip.description,
              hashtags: opusClip.hashtags,
              keywords: opusClip.keywords,
              prompt_name: opusClip.promptName,
              genre: opusClip.genre,
              subgenre: opusClip.subgenre,
              duration_ms: opusClip.durationMs,
              storage_used: opusClip.storageUsed,
              time_ranges: opusClip.timeRanges,
              uri_for_preview: opusClip.uriForPreview,
              uri_for_export: opusClip.uriForExport,
              render_pref: opusClip.renderPref,
              raw_response: opusClip,
            })
            .returning();

          savedClips.push(newClip);
        }

        syncedCount++;
      } catch (clipError) {
        console.error(`Failed to save clip ${opusClip.id}:`, clipError);
        // Continue with next clip
      }
    }

    return NextResponse.json({
      data: {
        synced: syncedCount,
        total: opusClips.length,
        clips: savedClips,
        projectStage: project.stage,
        status: 'synced',
        message: `Successfully synced ${syncedCount} clips`,
      },
    });
  } catch (error) {
    console.error('Failed to sync clips:', error);

    return NextResponse.json(
      {
        error: {
          code: 'SYNC_CLIPS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync clips',
          details: error instanceof Error ? error.stack : undefined,
        },
      },
      { status: 500 }
    );
  }
}
