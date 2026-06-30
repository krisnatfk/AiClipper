'use client';

import { Search, LayoutGrid, List, ArrowUpDown } from 'lucide-react';

export type ViewMode = 'grid' | 'list';
export type SortKey = 'score' | 'duration' | 'date';

interface ClipToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  minScore: number;
  onMinScore: (v: number) => void;
  totalCount: number;
}

/**
 * Toolbar for the result clips page (spec Section E items 2–6): search, view
 * mode toggle, filter (min score), and sort. Keep it self-contained; the
 * parent owns the filter state so the grid re-renders.
 */
export default function ClipToolbar({
  search,
  onSearch,
  view,
  onView,
  sort,
  onSort,
  minScore,
  onMinScore,
  totalCount,
}: ClipToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Find keywords or moments..."
          className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
          aria-label="Search clips"
        />
      </div>

      {/* Filter (min score) */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
        <span className="text-xs text-secondary whitespace-nowrap">Min score</span>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={minScore}
          onChange={(e) => onMinScore(Number(e.target.value))}
          className="accent-accent w-24"
          aria-label="Minimum score"
        />
        <span className="text-xs font-medium text-primary w-7">{minScore}</span>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
        <ArrowUpDown className="w-4 h-4 text-secondary" />
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="bg-transparent text-sm text-primary focus:outline-none"
          aria-label="Sort clips"
        >
          <option value="score">Sort: Score</option>
          <option value="duration">Sort: Duration</option>
          <option value="date">Sort: Newest</option>
        </select>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        <button
          type="button"
          onClick={() => onView('grid')}
          className={`p-1.5 rounded ${view === 'grid' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
          aria-label="Grid view"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onView('list')}
          className={`p-1.5 rounded ${view === 'list' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
          aria-label="List view"
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      <div className="hidden md:flex items-center text-xs text-secondary whitespace-nowrap">
        {totalCount} clip{totalCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
