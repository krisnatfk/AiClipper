import AppShell from '@/components/layout/AppShell';
import HeroCreateInput from '@/components/home/HeroCreateInput';
import ToolGrid from '@/components/home/ToolGrid';
import StatusBar from '@/components/home/StatusBar';
import ProjectCard from '@/components/project/ProjectCard';
import EmptyState from '@/components/ui/EmptyState';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import { FolderOpen, Sparkles } from 'lucide-react';

async function getRecentProjects() {
  try {
    const recentProjects = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.created_at))
      .limit(8);

    return recentProjects;
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return [];
  }
}

async function getTotalStorageBytes() {
  try {
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(COALESCE(${projects.storage_size}, ${projects.file_size}, 0)), 0)` })
      .from(projects);
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

export default async function HomePage() {
  const [recentProjects, totalStorageBytes] = await Promise.all([
    getRecentProjects(),
    getTotalStorageBytes(),
  ]);

  return (
    <AppShell>
      <div className="min-h-full bg-canvas">
        {/* Hero Section */}
        <section className="border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4" />
                AI-Powered Video Clipping
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary mb-4">
                Transform Videos into
                <br />
                <span className="text-accent">Viral Short Clips</span>
              </h1>
              <p className="text-base sm:text-lg text-secondary max-w-2xl mx-auto">
                Turn your long-form content into engaging short clips with AI.
                Perfect for YouTube Shorts, TikTok, Instagram Reels, and more.
              </p>
            </div>

            <HeroCreateInput />
          </div>
        </section>

        {/* Tools Section */}
        <section className="border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <ToolGrid />
          </div>
        </section>

        {/* Projects Section */}
        <section>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-primary">
                  Recent Projects
                </h2>
                <p className="text-sm text-secondary mt-1">
                  Your latest video clipping projects
                </p>
              </div>

              {/* Status Indicators */}
              <StatusBar totalStorageBytes={totalStorageBytes} />
            </div>

            {/* Projects Grid */}
            {recentProjects.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recentProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<FolderOpen className="w-16 h-16" />}
                title="No projects yet"
                description="Get started by creating your first video clipping project above"
              />
            )}

            {/* View All Link */}
            {recentProjects.length > 0 && (
              <div className="mt-8 text-center">
                <a
                  href="/projects"
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-blue-400 transition-colors"
                >
                  View all projects
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Tutorial Section - Placeholder */}
        <section className="border-t border-border bg-sidebar/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-primary mb-2">
                Master Video Clipping
              </h3>
              <p className="text-sm text-secondary mb-6">
                Learn tips and tricks to create amazing short-form content
              </p>
              <button className="btn-secondary">
                Watch Tutorials
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
