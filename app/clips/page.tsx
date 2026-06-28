import AppShell from '@/components/layout/AppShell';
import ClipCard from '@/components/clip/ClipCard';
import EmptyState from '@/components/ui/EmptyState';
import { db } from '@/lib/db';
import { clips } from '@/lib/db/schema';
import { desc, like, or } from 'drizzle-orm';
import { Film, Search } from 'lucide-react';

async function getClips(searchQuery?: string) {
  try {
    let query = db.select().from(clips);

    // Apply search filter
    if (searchQuery) {
      query = query.where(
        or(
          like(clips.title, `%${searchQuery}%`),
          like(clips.description, `%${searchQuery}%`),
          like(clips.hashtags, `%${searchQuery}%`)
        )
      ) as any;
    }

    const allClips = await query.orderBy(desc(clips.created_at));

    return allClips;
  } catch (error) {
    console.error('Failed to fetch clips:', error);
    return [];
  }
}

export default async function ClipsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const searchQuery = searchParams.q;
  const allClips = await getClips(searchQuery);

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">All Clips</h1>
            <p className="text-sm text-secondary">
              Browse all generated video clips across all projects
            </p>
          </div>

          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <form action="/clips" method="get" className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                <input
                  type="text"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search clips by title, description, or hashtags..."
                  className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </form>
            </div>
          </div>

          {/* Stats */}
          {allClips.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-accent" />
                <span className="text-secondary">
                  {allClips.length} clip{allClips.length !== 1 ? 's' : ''} found
                </span>
              </div>
            </div>
          )}

          {/* Clips Grid */}
          {allClips.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allClips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Film className="w-16 h-16" />}
              title={searchQuery ? 'No clips found' : 'No clips yet'}
              description={
                searchQuery
                  ? 'Try adjusting your search query'
                  : 'Create projects and sync clips to see them here'
              }
              action={
                !searchQuery && (
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
