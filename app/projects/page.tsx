import AppShell from '@/components/layout/AppShell';
import ProjectCard from '@/components/project/ProjectCard';
import EmptyState from '@/components/ui/EmptyState';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { desc, or, like, sql } from 'drizzle-orm';
import { FolderOpen, Search } from 'lucide-react';

async function getProjects(searchQuery?: string, filter?: string) {
  try {
    let query = db.select().from(projects);

    if (searchQuery) {
      query = query.where(
        or(
          like(projects.title, `%${searchQuery}%`),
          like(projects.project_id, `%${searchQuery}%`)
        )
      ) as any;
    }

    if (filter && filter !== 'all') {
      if (filter === 'FAILED') {
        query = query.where(
          sql`${projects.status} IN ('FAILED', 'PARTIAL_COMPLETED') OR ${projects.stage} IN ('FAILED', 'STALLED')`
        ) as any;
      } else if (filter === 'PROCESSING') {
        query = query.where(
          sql`${projects.status} NOT IN ('COMPLETED', 'FAILED', 'CANCELED', 'PARTIAL_COMPLETED') AND ${projects.stage} NOT IN ('COMPLETE', 'FAILED', 'STALLED')`
        ) as any;
      } else {
        query = query.where(
          sql`${projects.status} = ${filter} OR ${projects.stage} = ${filter}`
        ) as any;
      }
    }

    return await query.orderBy(desc(projects.created_at));
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return [];
  }
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string };
}) {
  const searchQuery = searchParams.q;
  const filter = searchParams.filter;
  const allProjects = await getProjects(searchQuery, filter);

  const filters = [
    { label: 'All', value: 'all' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Processing', value: 'PROCESSING' },
    { label: 'Failed / Partial', value: 'FAILED' },
  ];

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Projects</h1>
            <p className="text-sm text-secondary">
              Manage your local AI video clipping projects
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <form action="/projects" method="get" className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                <input
                  type="text"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search projects..."
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  aria-label="Search projects"
                />
                {filter && <input type="hidden" name="filter" value={filter} />}
              </form>
            </div>

            <nav className="flex gap-2 flex-wrap" aria-label="Filter projects">
              {filters.map((f) => (
                <a
                  key={f.value}
                  href={`/projects?filter=${f.value}${searchQuery ? `&q=${searchQuery}` : ''}`}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    (filter === f.value || (!filter && f.value === 'all'))
                      ? 'bg-accent text-white'
                      : 'bg-card border border-border text-secondary hover:text-primary hover:bg-hover'
                  }`}
                >
                  {f.label}
                </a>
              ))}
            </nav>
          </div>

          {allProjects.length > 0 ? (
            <>
              <div className="text-sm text-secondary mb-2">
                {allProjects.length} project{allProjects.length !== 1 ? 's' : ''} found
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {allProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<FolderOpen className="w-16 h-16" />}
              title={searchQuery || filter ? 'No projects found' : 'No projects yet'}
              description={
                searchQuery || filter
                  ? 'Try adjusting your search or filter'
                  : 'Upload your first video to start the self-processing pipeline'
              }
              action={
                !searchQuery && !filter && (
                  <a href="/" className="btn-primary">
                    Create Project
                  </a>
                )
              }
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

