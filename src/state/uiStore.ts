import create from 'zustand';
import { shallow } from 'zustand/shallow';

// Phase 1: Minimal UI-only state separated from document data.
export type UIState = {
    playheadTick: number; // UI's notion (may mirror timeline.currentTick for now)
    timelineZoom: number; // arbitrary zoom factor (1 = base)
    selection: {
        elementIds: string[]; // selection in the scene UI, not persisted
    };
    // Actions
    setPlayheadTick: (t: number) => void;
    setTimelineZoom: (z: number) => void;
    selectElements: (ids: string[]) => void;
};

export const useUIStore = create<UIState>((set) => ({
    playheadTick: 0,
    timelineZoom: 1,
    selection: { elementIds: [] },
    setPlayheadTick(t) {
        set({ playheadTick: Math.max(0, Math.floor(t)) });
    },
    setTimelineZoom(z) {
        const v = isFinite(z) && z > 0 ? z : 1;
        // Clamp to a reasonable range
        const clamped = Math.max(0.05, Math.min(200, v));
        set({ timelineZoom: clamped });
    },
    selectElements(ids) {
        set({ selection: { elementIds: [...ids] } });
    },
}));

export const useUIStoreShallow = <T>(selector: (s: UIState) => T) => useUIStore(selector, shallow);
