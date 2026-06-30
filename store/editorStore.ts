import { create } from 'zustand';

export type TabType =
  | 'templates'
  | 'captions'
  | 'hook'
  | 'layout'
  | 'tracking'
  | 'export'
  | 'transcript'
  // Placeholder tabs (right toolbar shows them disabled as "coming soon").
  | 'b-roll'
  | 'transitions'
  | 'text'
  | 'audio';
export type LayoutMode = 'full' | 'fit' | 'split-top-bottom' | 'split-speaker-screen' | 'crop' | 'square' | 'landscape';
export type ReframeMode = 'fit-blur' | 'face-center-crop' | 'person-center-crop' | 'manual-crop' | 'manual-keyframe';

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  position: 'top' | 'middle' | 'bottom';
  maxWordsPerLine: number;
  highlightEnabled: boolean;
  highlightColor: string;
  uppercase: boolean;
  animation: 'none' | 'pop' | 'fade' | 'slide' | 'karaoke' | 'bounce' | 'glitch' | 'scale-in';
}

export interface HookStyle {
  text: string;
  position: 'top' | 'middle' | 'bottom';
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  startTime: number;
  endTime: number;
  animation: 'none' | 'pop' | 'fade' | 'scale-in';
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutConfig {
  mode: LayoutMode;
  aspectRatio: string;
  reframeMode?: ReframeMode;
  fallbackMode?: ReframeMode;
  manualCrop?: Region;
  manualKeyframes?: Array<Region & { timestamp: number }>;
  topRegion?: Region;
  bottomRegion?: Region;
}

export interface OverlayLayer {
  id: string;
  type: 'highlight' | 'text' | 'image' | 'blur';
  startTime: number;
  endTime: number;
  zIndex: number;
  config: any;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface HistorySnapshot {
  captionStyle: CaptionStyle;
  hookStyle: HookStyle;
  layoutConfig: LayoutConfig;
  overlayLayers: OverlayLayer[];
}

interface EditorState {
  // Video Player State
  currentTime: number;
  isPlaying: boolean;
  duration: number;

  // UI State
  activeTab: TabType;
  selectedLayerId: string | null;

  // Clip Config
  clipId: string | null;
  projectId: string | null;
  videoUrl: string | null;
  sourceType: string;
  captionStyle: CaptionStyle;
  hookStyle: HookStyle;
  layoutConfig: LayoutConfig;
  overlayLayers: OverlayLayer[];

  // Transcript (loaded from backend)
  transcriptSegments: TranscriptSegment[];

  // Save / export state (decision D6)
  isDirty: boolean;
  isSaving: boolean;
  renderStatus: 'idle' | 'rendering' | 'completed' | 'failed';
  renderError: string | null;

  // Undo / redo
  history: HistorySnapshot[];
  historyIndex: number;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setActiveTab: (tab: TabType) => void;
  setSelectedLayerId: (id: string | null) => void;
  setVideoUrl: (url: string | null) => void;

  setCaptionStyle: (style: Partial<CaptionStyle>) => void;
  setHookStyle: (style: Partial<HookStyle>) => void;
  setLayoutConfig: (config: Partial<LayoutConfig>) => void;

  addOverlayLayer: (layer: Omit<OverlayLayer, 'id'>) => void;
  updateOverlayLayer: (id: string, updates: Partial<OverlayLayer>) => void;
  removeOverlayLayer: (id: string) => void;

  setTranscriptSegments: (segments: TranscriptSegment[]) => void;
  updateTranscriptSegment: (id: number, text: string) => void;

  // Hydration from backend (Chunk 9)
  loadClip: (data: {
    clipId: string;
    projectId?: string;
    videoUrl: string;
    sourceType?: string;
    captionConfig?: CaptionStyle | null;
    hookConfig?: HookStyle | null;
    layoutConfig?: Partial<LayoutConfig> | null;
    transcriptSegments?: TranscriptSegment[];
  }) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  save: () => Promise<boolean>;
  export: () => Promise<boolean>;
  pollRenderStatus: (clipId: string) => Promise<void>;

  resetRenderStatus: () => void;
}

const defaultCaptionStyle: CaptionStyle = {
  fontFamily: 'Inter',
  fontSize: 58,
  fontWeight: 900,
  textColor: '#FFFFFF',
  strokeColor: '#000000',
  strokeWidth: 8,
  shadow: true,
  shadowColor: '#000000',
  position: 'bottom',
  maxWordsPerLine: 4,
  highlightEnabled: true,
  highlightColor: '#FACC15',
  uppercase: true,
  animation: 'pop',
};

const defaultHookStyle: HookStyle = {
  text: '',
  position: 'top',
  fontSize: 72,
  fontWeight: 900,
  textColor: '#FFFFFF',
  backgroundColor: '#00000000',
  strokeColor: '#000000',
  strokeWidth: 6,
  startTime: 0,
  endTime: 4,
  animation: 'scale-in',
};

const defaultLayoutConfig: LayoutConfig = {
  mode: 'full',
  aspectRatio: '9:16',
  reframeMode: 'face-center-crop',
  fallbackMode: 'fit-blur',
};

const MAX_HISTORY = 50;

export const useEditorStore = create<EditorState>((set, get) => ({
  currentTime: 0,
  isPlaying: false,
  duration: 0,

  activeTab: 'captions',
  selectedLayerId: null,

  clipId: null,
  projectId: null,
  videoUrl: null,
  sourceType: 'upload',
  captionStyle: defaultCaptionStyle,
  hookStyle: defaultHookStyle,
  layoutConfig: defaultLayoutConfig,
  overlayLayers: [],

  transcriptSegments: [],

  isDirty: false,
  isSaving: false,
  renderStatus: 'idle',
  renderError: null,

  history: [],
  historyIndex: -1,

  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setDuration: (duration) => set({ duration }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedLayerId: (id) => set({ selectedLayerId: id }),
  setVideoUrl: (url) => set({ videoUrl: url }),

  setCaptionStyle: (style) => {
    set((state) => ({ captionStyle: { ...state.captionStyle, ...style }, isDirty: true }));
  },
  setHookStyle: (style) => {
    set((state) => ({ hookStyle: { ...state.hookStyle, ...style }, isDirty: true }));
  },
  setLayoutConfig: (config) => {
    set((state) => ({ layoutConfig: { ...state.layoutConfig, ...config }, isDirty: true }));
  },

  addOverlayLayer: (layer) =>
    set((state) => ({
      overlayLayers: [...state.overlayLayers, { ...layer, id: crypto.randomUUID() }],
      isDirty: true,
    })),

  updateOverlayLayer: (id, updates) =>
    set((state) => ({
      overlayLayers: state.overlayLayers.map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer
      ),
      isDirty: true,
    })),

  removeOverlayLayer: (id) =>
    set((state) => ({
      overlayLayers: state.overlayLayers.filter((layer) => layer.id !== id),
      isDirty: true,
    })),

  setTranscriptSegments: (segments) => set({ transcriptSegments: segments }),

  updateTranscriptSegment: (id, text) =>
    set((state) => ({
      transcriptSegments: state.transcriptSegments.map((seg) =>
        seg.id === id ? { ...seg, text } : seg
      ),
      isDirty: true,
    })),

  loadClip: (data) => {
    set({
      clipId: data.clipId,
      projectId: data.projectId ?? null,
      videoUrl: data.videoUrl,
      sourceType: data.sourceType ?? 'upload',
      captionStyle: data.captionConfig ? { ...defaultCaptionStyle, ...data.captionConfig } : defaultCaptionStyle,
      hookStyle: data.hookConfig ? { ...defaultHookStyle, ...data.hookConfig } : defaultHookStyle,
      layoutConfig: data.layoutConfig ? { ...defaultLayoutConfig, ...data.layoutConfig } : defaultLayoutConfig,
      transcriptSegments: data.transcriptSegments ?? [],
      isDirty: false,
      history: [],
      historyIndex: -1,
    });
  },

  pushHistory: () => {
    const state = get();
    const snapshot: HistorySnapshot = {
      captionStyle: { ...state.captionStyle },
      hookStyle: { ...state.hookStyle },
      layoutConfig: { ...state.layoutConfig },
      overlayLayers: [...state.overlayLayers],
    };
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    const snapshot = state.history[state.historyIndex - 1];
    set({
      captionStyle: { ...snapshot.captionStyle },
      hookStyle: { ...snapshot.hookStyle },
      layoutConfig: { ...snapshot.layoutConfig },
      overlayLayers: [...snapshot.overlayLayers],
      historyIndex: state.historyIndex - 1,
      isDirty: true,
    });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    const snapshot = state.history[state.historyIndex + 1];
    set({
      captionStyle: { ...snapshot.captionStyle },
      hookStyle: { ...snapshot.hookStyle },
      layoutConfig: { ...snapshot.layoutConfig },
      overlayLayers: [...snapshot.overlayLayers],
      historyIndex: state.historyIndex + 1,
      isDirty: true,
    });
  },

  save: async () => {
    const state = get();
    if (!state.clipId) return false;
    set({ isSaving: true });
    try {
      const res = await fetch(`/api/clips/${state.clipId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout_config: state.layoutConfig,
          caption_config: state.captionStyle,
          hook_config: state.hookStyle,
          overlays: state.overlayLayers.map((o) => ({
            id: o.id.startsWith('layer_') ? undefined : o.id,
            type: o.type,
            start_time: o.startTime,
            end_time: o.endTime,
            z_index: o.zIndex,
            config: o.config,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message || 'Failed to save');
      }
      set({ isDirty: false, isSaving: false });
      return true;
    } catch (error) {
      set({ isSaving: false });
      throw error;
    }
  },

  export: async () => {
    const state = get();
    if (!state.clipId) return false;
    set({ renderStatus: 'rendering', renderError: null });
    try {
      const res = await fetch(`/api/clips/${state.clipId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ render_config: state.layoutConfig }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error?.message || 'Failed to start render');
      }
      // Poll for completion.
      await get().pollRenderStatus(state.clipId);
      return true;
    } catch (error) {
      set({
        renderStatus: 'failed',
        renderError: error instanceof Error ? error.message : 'Export failed',
      });
      throw error;
    }
  },

  pollRenderStatus: async (clipId) => {
    const maxAttempts = 120; // ~10 min at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const res = await fetch(`/api/clips/${clipId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const clip = data.data?.clip;
        if (!clip) continue;
        if (clip.status === 'COMPLETED') {
          set({ renderStatus: 'completed', videoUrl: `/api/clips/${clipId}/video` });
          return;
        }
        if (clip.status === 'FAILED' || clip.status === 'CANCELED') {
          set({
            renderStatus: 'failed',
            renderError: clip.error_message || 'Render failed',
          });
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    set({ renderStatus: 'failed', renderError: 'Render timed out' });
  },

  resetRenderStatus: () => set({ renderStatus: 'idle', renderError: null }),
}));
