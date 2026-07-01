import AppShell from '@/components/layout/AppShell';
import ConfigurationForm from '@/components/configure/ConfigurationForm';
import { db } from '@/lib/db';
import { projects, renderTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ArrowLeft, Film, FileVideo, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { formatBytes } from '@/lib/utils';
import type { RenderTemplate } from '@/types';
import { BUILTIN_CAPTION_TEMPLATES, toRenderTemplateRow } from '@/lib/captions/builtinCaptionTemplates.mjs';
import { probeVideoMetadata } from '@/lib/video/probeVideoMetadata';

async function getProjectAndTemplates(projectId: string) {
  let [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.project_id, projectId))
    .limit(1);

  if (!project) return null;

  if (!project.duration_seconds && project.source_file_path) {
    const probe = await probeVideoMetadata(project.source_file_path);
    if (probe?.durationSeconds) {
      await db
        .update(projects)
        .set({
          duration_seconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          codec: probe.codec,
          raw_metadata: probe.rawMetadata,
          timeframe_start_sec: project.timeframe_start_sec ?? 0,
          timeframe_end_sec: project.timeframe_end_sec ?? probe.durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .where(eq(projects.project_id, projectId));
      project = {
        ...project,
        duration_seconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        codec: probe.codec,
        raw_metadata: probe.rawMetadata,
        timeframe_start_sec: project.timeframe_start_sec ?? 0,
        timeframe_end_sec: project.timeframe_end_sec ?? probe.durationSeconds,
      };
    }
  }

  const dbTemplates = await db
    .select()
    .from(renderTemplates)
    .orderBy(renderTemplates.is_builtin, renderTemplates.name);
  const seen = new Set(dbTemplates.map((template) => template.template_id));
  const builtinFallbacks = BUILTIN_CAPTION_TEMPLATES
    .filter((template) => !seen.has(template.id))
    .map((template, index) => toRenderTemplateRow(template, index));

  return { project, templates: [...dbTemplates, ...builtinFallbacks] as unknown as RenderTemplate[] };
}

export default async function ConfigurePage({
  params,
}: {
  params: { projectId: string };
}) {
  const data = await getProjectAndTemplates(params.projectId);

  if (!data) notFound();

  const { project, templates } = data;
  const isUpload = project.source_type === 'upload';
  const sourceLabel = isUpload
    ? project.source_file_path?.split(/[\\/]/).pop() || 'Uploaded video'
    : project.source_url || 'Video URL';

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-5">
          <Link
            href="/create"
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Create
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
            <aside className="card bg-card/80 p-4 space-y-4 lg:sticky lg:top-6">
              <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center border border-border">
                <Film className="w-12 h-12 text-white/25" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-secondary">Source video</div>
                  <div className="text-sm text-primary font-semibold truncate flex items-center gap-2">
                    <FileVideo className="w-4 h-4 flex-shrink-0 text-accent" />
                    {sourceLabel}
                  </div>
                </div>
                <span className="badge-accent whitespace-nowrap">Ready</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <Metric label="Resolution" value={project.width && project.height ? `${project.width}x${project.height}` : 'Pending'} />
                <Metric label="Quality" value={project.height ? `${project.height}p` : 'Pending'} />
                <Metric label="Duration" value={project.duration_seconds ? `${Math.floor(project.duration_seconds / 60)}m ${project.duration_seconds % 60}s` : 'Pending'} />
                <Metric label="Size" value={project.file_size ? formatBytes(project.file_size) : '-'} />
              </div>

              <div className="rounded-lg border border-energy/20 bg-energy/10 p-3 text-xs leading-relaxed text-energy">
                Using video you do not own may violate copyright laws. By continuing, you confirm this is your own original content.
              </div>

              <Link
                href="/create"
                className="flex items-center gap-2 text-xs text-alert hover:text-alert/80 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Link>
            </aside>

            <main>
              <ConfigurationForm project={project} templates={templates} />
            </main>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-sidebar/50 p-2.5">
      <div className="text-secondary mb-0.5">{label}</div>
      <div className="text-primary font-medium truncate">{value}</div>
    </div>
  );
}
