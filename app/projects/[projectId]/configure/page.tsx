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

async function getProjectAndTemplates(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.project_id, projectId))
    .limit(1);

  if (!project) return null;

  const templates = await db
    .select()
    .from(renderTemplates)
    .orderBy(renderTemplates.is_builtin, renderTemplates.name);

  return { project, templates: templates as unknown as RenderTemplate[] };
}

/**
 * Project configuration page (spec Section C / decision D1 step 2).
 *
 * Renders BEFORE any processing starts. The user picks all clipping options
 * here, then "Get clips in 1 click" saves settings (PATCH) and starts the
 * worker (POST /start).
 */
export default async function ConfigurePage({
  params,
}: {
  params: { projectId: string };
}) {
  const data = await getProjectAndTemplates(params.projectId);

  if (!data) {
    notFound();
  }

  const { project, templates } = data;
  const isUpload = project.source_type === 'upload';
  const sourceLabel = isUpload
    ? project.source_file_path?.split('/').pop() || 'Uploaded video'
    : project.source_url || 'Direct URL';

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <Link
            href="/create"
            className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Create
          </Link>

          <div>
            <h1 className="text-2xl font-bold text-primary mb-1">Configure Project</h1>
            <p className="text-sm text-secondary">
              Set your clipping options before processing. Your video won’t be processed until you click “Get clips in 1 click”.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Video source preview (spec C.1) */}
            <aside className="space-y-4">
              <div className="card p-4 space-y-3">
                <div className="aspect-video bg-sidebar rounded-lg overflow-hidden flex items-center justify-center">
                  <Film className="w-12 h-12 text-secondary/30" />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs text-secondary">Source video</div>
                  <div className="text-sm text-primary font-medium truncate flex items-center gap-2">
                    <FileVideo className="w-4 h-4 flex-shrink-0 text-accent" />
                    {sourceLabel}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-secondary mb-0.5">Resolution</div>
                    <div className="text-primary">
                      {project.width && project.height
                        ? `${project.height}p`
                        : 'Pending probe'}
                    </div>
                  </div>
                  <div>
                    <div className="text-secondary mb-0.5">Duration</div>
                    <div className="text-primary">
                      {project.duration_seconds
                        ? `${Math.floor(project.duration_seconds / 60)}m ${project.duration_seconds % 60}s`
                        : 'Pending probe'}
                    </div>
                  </div>
                  <div>
                    <div className="text-secondary mb-0.5">Size</div>
                    <div className="text-primary">
                      {project.file_size ? formatBytes(project.file_size) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-secondary mb-0.5">Source type</div>
                    <div className="text-primary capitalize">{project.source_type}</div>
                  </div>
                </div>

                <Link
                  href="/create"
                  className="flex items-center gap-2 text-xs text-alert hover:text-alert/80 transition-colors pt-2 border-t border-border"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove & choose another video
                </Link>
              </div>
            </aside>

            {/* Configuration form */}
            <main>
              <ConfigurationForm project={project} templates={templates} />
            </main>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
