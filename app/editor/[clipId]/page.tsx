'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/store/editorStore';
import Button from '@/components/ui/Button';
import {
  ArrowLeft,
  Save,
  Download,
  Undo2,
  Redo2,
  Play,
  LayoutTemplate,
  Type,
  SplitSquareVertical,
  Crop,
  ScrollText,
  Settings,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

import VideoPreview from '@/components/editor/VideoPreview';
import Timeline from '@/components/editor/Timeline';
import CaptionPanel from '@/components/editor/panels/CaptionPanel';
import HookPanel from '@/components/editor/panels/HookPanel';
import LayoutPanel from '@/components/editor/panels/LayoutPanel';
import TemplatePanel from '@/components/editor/panels/TemplatePanel';
import TrackingPanel from '@/components/editor/panels/TrackingPanel';
import ExportPanel from '@/components/editor/panels/ExportPanel';
import TranscriptEditor from '@/components/editor/TranscriptEditor';
import EditorRightToolbar from '@/components/editor/EditorRightToolbar';
import RenderProgressDialog from '@/components/editor/RenderProgressDialog';

export default function EditorPage({ params }: { params: { clipId: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const {
    activeTab,
    setActiveTab,
    isPlaying,
    setIsPlaying,
    currentTime,
    duration,
    loadClip,
    save,
    export: doExport,
    isDirty,
    isSaving,
    undo,
    redo,
    pushHistory,
  } = useEditorStore();

  useEffect(() => {
    const loadClipData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/clips/${params.clipId}`);
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error?.message || 'Failed to load clip');
        }
        const { data } = await res.json();
        const clip = data.clip;
        const project = data.project;
        const edit = data.edit;

        // Parse editor config (clip_edits JSON).
        const captionConfig = edit?.caption_config ?? null;
        const hookConfig = edit?.hook_config ?? null;
        const layoutConfig = edit?.layout_config ?? null;

        // Parse transcript segments from the project's transcript.
        let transcriptSegments: { id: number; start: number; end: number; text: string }[] = [];
        if (project) {
          try {
            const tRes = await fetch(`/api/projects/${project.project_id}/transcript`);
            if (tRes.ok) {
              const tData = await tRes.json();
              const t = tData.data;
              if (t?.segments && Array.isArray(t.segments)) {
                transcriptSegments = t.segments.map((seg: any, i: number) => ({
                  id: i,
                  start: Number(seg.start ?? 0),
                  end: Number(seg.end ?? 0),
                  text: String(seg.text ?? ''),
                }));
              }
            }
          } catch {
            /* transcript optional */
          }
        }

        loadClip({
          clipId: params.clipId,
          projectId: project?.project_id,
          videoUrl: `/api/clips/${params.clipId}/video`,
          sourceType: project?.source_type,
          captionConfig,
          hookConfig,
          layoutConfig,
          transcriptSegments,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load clip');
      } finally {
        setLoading(false);
      }
    };

    loadClipData();
  }, [params.clipId, loadClip]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await save();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleExport = async () => {
    // Save first if dirty, then export.
    if (isDirty) {
      await handleSave();
    }
    try {
      await doExport();
    } catch {
      /* error surfaced via RenderProgressDialog */
    }
  };

  const handleUndo = () => {
    pushHistory();
    undo();
  };

  const handleRedo = () => {
    redo();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-secondary">Loading editor…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-center space-y-4">
          <p className="text-alert">{error}</p>
          <Link href="/projects" className="text-accent hover:underline text-sm">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-canvas text-primary overflow-hidden">
      {/* TOP BAR */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-sidebar shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/projects" className="text-secondary hover:text-primary transition-colors" aria-label="Back to projects">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-semibold text-sm">
            AutoClip Editor <span className="text-secondary font-normal ml-2">Clip: {params.clipId.slice(0, 12)}…</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-canvas transition-colors disabled:opacity-40"
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-canvas transition-colors disabled:opacity-40"
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button variant="ghost" size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
            {saveStatus === 'saving' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save changes'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export &amp; Render
          </Button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT PANEL */}
        <aside className="w-80 border-r border-border bg-sidebar flex flex-col shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-border overflow-x-auto custom-scrollbar shrink-0">
            <TabButton active={activeTab === 'transcript'} onClick={() => setActiveTab('transcript')} icon={<ScrollText className="w-4 h-4" />} label="Transcript" />
            <TabButton active={activeTab === 'templates'} onClick={() => setActiveTab('templates')} icon={<LayoutTemplate className="w-4 h-4" />} label="Templates" />
            <TabButton active={activeTab === 'captions'} onClick={() => setActiveTab('captions')} icon={<Type className="w-4 h-4" />} label="Captions" />
            <TabButton active={activeTab === 'hook'} onClick={() => setActiveTab('hook')} icon={<Type className="w-4 h-4" />} label="Hook" />
            <TabButton active={activeTab === 'layout'} onClick={() => setActiveTab('layout')} icon={<SplitSquareVertical className="w-4 h-4" />} label="Layout" />
            <TabButton active={activeTab === 'tracking'} onClick={() => setActiveTab('tracking')} icon={<Crop className="w-4 h-4" />} label="Tracking" />
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'transcript' && <TranscriptEditor />}
            {activeTab === 'templates' && <TemplatePanel />}
            {activeTab === 'captions' && <CaptionPanel />}
            {activeTab === 'hook' && <HookPanel />}
            {activeTab === 'layout' && <LayoutPanel />}
            {activeTab === 'tracking' && <TrackingPanel />}
            {activeTab === 'export' && <ExportPanel />}
          </div>
        </aside>

        {/* CENTER CANVAS */}
        <main className="flex-1 bg-black relative flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
            <VideoPreview />
          </div>

          {/* Player Controls Mini */}
          <div className="h-14 border-t border-border bg-sidebar flex items-center justify-center gap-4 shrink-0">
            <button
              className={`p-3 rounded-full transition-colors ${isPlaying ? 'bg-energy text-black' : 'hover:bg-canvas text-primary'}`}
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <Play className="w-5 h-5 fill-current" />
            </button>
            <div className="text-sm font-mono text-secondary w-32 text-center">
              {currentTime.toFixed(2)} / {duration.toFixed(2)}s
            </div>
          </div>
        </main>

        {/* RIGHT PANEL (PROPERTIES / EXPORT) */}
        <aside className="w-72 border-l border-border bg-sidebar p-4 overflow-y-auto shrink-0">
          {activeTab === 'export' ? (
            <ExportPanel />
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Properties
              </div>
              <div className="text-xs text-secondary">
                Select a tool from the right toolbar to edit captions, hooks, layout, or tracking. Changes save as JSON config (non-destructive).
              </div>
              {isDirty && (
                <div className="text-xs text-energy bg-energy/10 rounded p-2">
                  Unsaved changes — click “Save changes”.
                </div>
              )}
            </div>
          )}
        </aside>

        {/* RIGHT TOOLBAR (vertical icons) */}
        <EditorRightToolbar />
      </div>

      {/* BOTTOM TIMELINE */}
      <Timeline />

      {/* Render progress modal */}
      <RenderProgressDialog />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-secondary hover:text-primary hover:bg-canvas/50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
