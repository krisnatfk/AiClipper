'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import ClipCard from '@/components/clip/ClipCard';
import ClipToolbar, { ViewMode, SortKey } from '@/components/clip/ClipToolbar';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { Clip, Project } from '@/types';
import { ArrowLeft, Film, RotateCcw } from 'lucide-react';
import Link from 'next/link';

interface ClipsPageProps {
  params: { projectId: string };
}

/**
 * Result clips page (spec Section E). A dedicated page for browsing all clips
 * of a completed project, with search / filter / sort / view-mode controls.
 * Polls while the project is still processing so clips appear as they render.
 */
export default function ClipsResultPage({ params }: ClipsPageProps) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Toolbar state
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [sort, setSort] = useState<SortKey>('score');
  const [minScore, setMinScore] = useState(0);

  const isProcessing = useMemo(() => {
    if (!project) return false;
    const s = project.status || project.stage;
    return ['QUEUED', 'PROBING', 'EXTRACTING_AUDIO', 'TRANSCRIBING', 'ANALYZING', 'PLANNING_CLIPS', 'RENDERING', 'UPLOADING_OUTPUT'].includes(s);
  }, [project]);

  const isCompleted = project?.status === 'COMPLETED' || project?.stage === 'COMPLETED' || project?.stage === 'COMPLETE';
  const isFailed = ['FAILED', 'STALLED', 'PARTIAL_COMPLETED'].includes(project?.status || project?.stage || '');

  // Fetch project + clips.
  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      try {
        setError('');
        const [pRes, cRes] = await Promise.all([
          fetch(`/api/projects/${params.projectId}`),
          fetch(`/api/projects/${params.projectId}/clips`),
        ]);
        if (!pRes.ok) throw new Error('Failed to fetch project');
        const pData = await pRes.json();
        if (active) setProject(pData.data);
        if (cRes.ok) {
          const cData = await cRes.json();
          if (active) setClips(cData.data || []);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAll();
    // Poll while processing (spec N — ~20s, not 5s spam).
    if (isProcessing) {
      const interval = setInterval(fetchAll, 20000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }
    return () => {
      active = false;
    };
  }, [params.projectId, isProcessing]);

  // Filter + sort clips locally.
  const filteredClips = useMemo(() => {
    let result = clips;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.text?.toLowerCase().includes(q) ||
          c.caption?.toLowerCase().includes(q) ||
          c.hook_text?.toLowerCase().includes(q)
      );
    }
    if (minScore > 0) {
      result = result.filter((c) => (c.score ?? 0) >= minScore);
    }
    result = [...result].sort((a, b) => {
      if (sort === 'score') return (b.score ?? 0) - (a.score ?? 0);
      if (sort === 'duration') return (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return result;
  }, [clips, search, minScore, sort]);

  const handleRetry = async () => {
    await fetch(`/api/projects/${params.projectId}/retry`, { method: 'POST' });
    router.refresh();
  };

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-full bg-canvas p-4 lg:p-8">
          <div className="max-w-7xl mx-auto animate-pulse space-y-6">
            <div className="h-8 bg-card rounded w-1/3" />
            <div className="h-10 bg-card rounded" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-96 bg-card rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Link href={`/projects/${params.projectId}`} className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </Link>

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-primary">{project?.title || 'Clips'}</h1>
              <p className="text-sm text-secondary mt-1">
                Original clips: {clips.length} • Showing {filteredClips.length}
              </p>
            </div>
          </div>

          {/* Processing banner */}
          {isProcessing && (
            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4 text-sm text-accent">
              Project is still processing ({project?.status}). Clips will appear here as they are rendered. Refreshes automatically.
            </div>
          )}

          {/* Failed banner */}
          {isFailed && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-4 space-y-3">
              <p className="text-sm text-alert">
                {project?.error_message || 'Processing failed or only partially completed.'}
              </p>
              <Button variant="secondary" size="sm" onClick={handleRetry} className="text-energy border-energy/30">
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry Project
              </Button>
            </div>
          )}

          {/* Toolbar */}
          {clips.length > 0 && (
            <ClipToolbar
              search={search}
              onSearch={setSearch}
              view={view}
              onView={setView}
              sort={sort}
              onSort={setSort}
              minScore={minScore}
              onMinScore={setMinScore}
              totalCount={filteredClips.length}
            />
          )}

          {/* Clips grid */}
          {filteredClips.length > 0 ? (
            <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>
              {filteredClips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  onDeleted={(clipId) => {
                    setClips((prev) => prev.filter((c) => (c.clip_id || `clip-${c.id}`) !== clipId));
                  }}
                />
              ))}
            </div>
          ) : isCompleted ? (
            <EmptyState
              icon={<Film className="w-16 h-16" />}
              title="No clips generated"
              description="Try another setting, adjust your prompt, or retry the project."
              action={
                <Button variant="secondary" onClick={handleRetry}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry with new settings
                </Button>
              }
            />
          ) : !isProcessing && !isFailed ? (
            <EmptyState
              icon={<Film className="w-16 h-16" />}
              title="No clips yet"
              description="Clips will appear here after the project finishes processing."
            />
          ) : null}

          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-4 text-sm text-alert">{error}</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
