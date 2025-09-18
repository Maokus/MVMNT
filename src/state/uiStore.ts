import create from 'zustand';
import { shallow } from 'zustand/shallow';

// Minimal UI-only state separated from document data.
export type UIState = {
    playheadTick: number; // UI's notion (may mirror timeline.currentTick for now)
    timelineZoom: number; // arbitrary zoom factor (1 = base)
    selection: {
        elementIds: string[]; // selection in the scene UI, not persisted
    };
    theme?: 'light' | 'dark' | 'system';
    // Actions
    setPlayheadTick: (t: number) => void;
    setTimelineZoom: (z: number) => void;
    selectElements: (ids: string[]) => void;
    setTheme: (t: UIState['theme']) => void;
};

const UI_PREFS_KEY = 'mvmnt.ui.prefs.v1';

type Prefs = Pick<UIState, 'timelineZoom' | 'theme'>;

function readPrefs(): Prefs | null {
    try {
        const raw = localStorage.getItem(UI_PREFS_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (typeof obj.timelineZoom === 'number') {
            return { timelineZoom: obj.timelineZoom, theme: obj.theme };
        }
    } catch {}
    return null;
}

function writePrefs(p: Prefs) {
    try {
        localStorage.setItem(UI_PREFS_KEY, JSON.stringify(p));
    } catch {}
}

export const useUIStore = create<UIState>((set, get) => {
    const prefs = readPrefs();
    return {
        playheadTick: 0,
        timelineZoom: prefs?.timelineZoom ?? 1,
        selection: { elementIds: [] },
        theme: prefs?.theme ?? 'system',
        setPlayheadTick(t) {
            set({ playheadTick: Math.max(0, Math.floor(t)) });
        },
        setTimelineZoom(z) {
            const v = isFinite(z) && z > 0 ? z : 1;
            // Clamp to a reasonable range
            const clamped = Math.max(0.05, Math.min(200, v));
            set({ timelineZoom: clamped });
            const { theme } = get();
            writePrefs({ timelineZoom: clamped, theme });
        },
        selectElements(ids) {
            set({ selection: { elementIds: [...ids] } });
        },
        setTheme(t) {
            set({ theme: t });
            const { timelineZoom } = get();
            writePrefs({ timelineZoom, theme: t });
        },
    };
});

export const useUIStoreShallow = <T>(selector: (s: UIState) => T) => useUIStore(selector, shallow);
