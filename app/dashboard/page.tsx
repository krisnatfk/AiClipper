import AppShell from '@/components/layout/AppShell';
import ProjectCard from '@/components/project/ProjectCard';
import ClipCard from '@/components/clip/ClipCard';
import Badge from '@/components/ui/Badge';
import { db } from '@/lib/db';
import { projects, clips } from '@/lib/db/schema';
import { desc, eq, count } from 'drizzle-orm';
import {
  FolderOpen,
  Film,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  HardDrive,
  TrendingUp,
} from 'lucide-react';

async function getDashboardStats() {
  try {
    const [totalProjects] = await db
      .select({ count: count() })
      .from(projects);

    const [totalClips] = await db
      .select({ count: count() })
      .from(clips);

    const [processingProjects] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.stage, 'RENDER'));

    const [completedProjects] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.stage, 'COMPLETE'));

    const [failedProjects] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.stage, 'FAILED'));

    const recentProjects = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.created_at))
      .limit(4);

    const recentClips = await db
      .select()
      .from(clips)
      .orderBy(desc(clips.created_at))
      .limit(4);

    return {
      totalProjects: totalProjects.count,
      totalClips: totalClips.count,
      processingProjects: processingProjects.count,
      completedProjects: completedProjects.count,
      failedProjects: failedProjects.count,
      recentProjects,
      recentClips,
    };
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    return {
      totalProjects: 0,
      totalClips: 0,
      processingProjects: 0,
      completedProjects: 0,
      failedProjects: 0,
      recentProjects: [],
      recentClips: [],
    };
  }
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const statCards = [
    {
      label: 'Total Projects',
      value: stats.totalProjects,
      icon: FolderOpen,
      color: 'accent',
    },
    {
      label: 'Total Clips',
      value: stats.totalClips,
      icon: Film,
      color: 'success',
    },
    {
      label: 'Processing',
      value: stats.processingProjects,
      icon: Clock,
      color: 'energy',
    },
    {
      label: 'Completed',
      value: stats.completedProjects,
      icon: CheckCircle,
      color: 'success',
    },
    {
      label: 'Failed',
      value: stats.failedProjects,
      icon: XCircle,
      color: 'alert',
    },
  ];

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Dashboard</h1>
            <p className="text-sm text-secondary">
              Overview of your video clipping activity and statistics
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-${stat.color}/10 flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 text-${stat.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-2xl font-bold text-primary">
                        {stat.value}
                      </div>
                      <div className="text-xs text-secondary truncate">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-success" />
                <h3 className="text-sm font-semibold text-primary">API Status</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-sm text-secondary">Connected</span>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-accent" />
                <h3 className="text-sm font-semibold text-primary">Credits</h3>
              </div>
              <div className="text-lg font-bold text-primary">--</div>
              <div className="text-xs text-secondary">Usage tracking coming soon</div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-5 h-5 text-energy" />
                <h3 className="text-sm font-semibold text-primary">Storage</h3>
              </div>
              <div className="text-lg font-bold text-primary">--</div>
              <div className="text-xs text-secondary">Storage tracking coming soon</div>
            </div>
          </div>

          {/* Recent Projects */}
          {stats.recentProjects.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-primary">Recent Projects</h2>
                <a
                  href="/projects"
                  className="text-sm font-medium text-accent hover:text-blue-400 transition-colors"
                >
                  View all →
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.recentProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </div>
          )}

          {/* Recent Clips */}
          {stats.recentClips.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-primary">Recent Clips</h2>
                <a
                  href="/clips"
                  className="text-sm font-medium text-accent hover:text-blue-400 transition-colors"
                >
                  View all →
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.recentClips.map((clip) => (
                  <ClipCard key={clip.id} clip={clip} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
