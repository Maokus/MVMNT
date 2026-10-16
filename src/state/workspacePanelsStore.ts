import { create } from 'zustand';

export type WorkspacePanelId = 'assets' | 'elements' | 'properties' | 'macros';
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
/** Side docks run the full height of the workspace and resize by width. */
export type VerticalDockSide = 'left' | 'right';
/** Top and bottom docks live in the centre column and resize by height. */
export type HorizontalDockSide = 'top' | 'bottom';

/** Canonical dock order; also the hit-test order used while dragging a tab. */
export const DOCK_SIDES: DockSide[] = ['left', 'right', 'top', 'bottom'];

export const WORKSPACE_PANEL_IDS: WorkspacePanelId[] = ['assets', 'elements', 'properties', 'macros'];

export const WORKSPACE_PANEL_LABELS: Record<WorkspacePanelId, string> = {
    assets: 'Assets',
    elements: 'Elements',
    properties: 'Properties',
    macros: 'Macros',
};

/** One stacked block of a dock: a tab strip plus the panel of its active tab. */
export interface DockSection {
    tabs: WorkspacePanelId[];
    active: WorkspacePanelId | null;
}

export type DockSections = Record<DockSide, DockSection[]>;

/** Where a dragged tab is released. `split` starts a new stacked section. */
export interface TabDrop {
    side: DockSide;
    /** Section the tab joins, or where a new section is inserted when splitting. */
    sectionIndex: number;
    /** Position within that section's strip; ignored when splitting. */
    tabIndex: number;
    split: boolean;
}

const STORAGE_KEY = 'mvmnt.workspace-layout';
const STORAGE_VERSION = 1;
// Stored dock sizes are clamped back into range so a corrupt value cannot lock the UI.
const MIN_STORED_SIZE = 120;
const MAX_STORED_SIZE = 640;

const DEFAULT_SECTIONS: DockSections = {
    left: [{ tabs: ['assets'], active: 'assets' }],
    right: [{ tabs: ['elements', 'properties', 'macros'], active: 'elements' }],
    top: [],
    bottom: [],
};

const DEFAULT_WIDTHS: Record<VerticalDockSide, number> = { left: 220, right: 320 };
const DEFAULT_HEIGHTS: Record<HorizontalDockSide, number> = { top: 200, bottom: 200 };

const DEFAULT_HIDDEN: Record<WorkspacePanelId, boolean> = {
    assets: false,
    elements: false,
    properties: false,
    macros: true,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const cloneSections = (sections: DockSections): DockSections =>
    DOCK_SIDES.reduce((accumulator, side) => {
        accumulator[side] = sections[side].map((section) => ({ ...section, tabs: [...section.tabs] }));
        return accumulator;
    }, {} as DockSections);

const isPanelId = (value: unknown): value is WorkspacePanelId =>
    typeof value === 'string' && WORKSPACE_PANEL_IDS.includes(value as WorkspacePanelId);

/** A panel belongs to whichever dock lists it. */
export const panelSide = (sections: DockSections, id: WorkspacePanelId): DockSide =>
    DOCK_SIDES.find((side) => sections[side].some((section) => section.tabs.includes(id))) ?? 'right';

export const panelSectionIndex = (sections: DockSections, side: DockSide, id: WorkspacePanelId): number =>
    sections[side].findIndex((section) => section.tabs.includes(id));

const firstVisible = (section: DockSection, hidden: Record<WorkspacePanelId, boolean>, exclude?: WorkspacePanelId) =>
    section.tabs.find((id) => id !== exclude && !hidden[id]) ?? null;

/** Copy the sections with one section's active tab replaced. */
const withActive = (
    sections: DockSections,
    side: DockSide,
    index: number,
    active: WorkspacePanelId | null
): DockSections => ({ ...sections, [side]: sections[side].map((s, i) => (i === index ? { ...s, active } : s)) });

/** Drop a tab column: remove the tab, hand the active tab on, and drop empty sections. */
const withoutTab = (list: DockSection[], hidden: Record<WorkspacePanelId, boolean>, id: WorkspacePanelId) =>
    list
        .map((section) =>
            section.tabs.includes(id)
                ? {
                      tabs: section.tabs.filter((tab) => tab !== id),
                      active: section.active === id ? firstVisible(section, hidden, id) : section.active,
                  }
                : section
        )
        .filter((section) => section.tabs.length > 0);

interface PersistedLayout {
    version?: unknown;
    sections?: unknown;
    hidden?: unknown;
    widths?: unknown;
    heights?: unknown;
}

const sanitizeSections = (input: unknown): DockSections => {
    const result: DockSections = { left: [], right: [], top: [], bottom: [] };
    if (!input || typeof input !== 'object') return result;
    const source = input as Record<string, unknown>;
    for (const side of DOCK_SIDES) {
        const list = source[side];
        if (!Array.isArray(list)) continue;
        result[side] = list
            .map((raw): DockSection | null => {
                if (!raw || typeof raw !== 'object') return null;
                const entry = raw as { tabs?: unknown; active?: unknown };
                const tabs = Array.isArray(entry.tabs) ? entry.tabs.filter(isPanelId) : [];
                if (tabs.length === 0) return null;
                const active = isPanelId(entry.active) && tabs.includes(entry.active) ? entry.active : tabs[0];
                return { tabs, active };
            })
            .filter((section): section is DockSection => section != null);
    }
    return result;
};

/** Restore the docks, falling back to the factory layout if nothing usable was stored. */
const sectionsFromStored = (input: unknown): DockSections => {
    const sections = sanitizeSections(input);
    return DOCK_SIDES.every((side) => sections[side].length === 0) ? cloneSections(DEFAULT_SECTIONS) : sections;
};

const sanitizeHidden = (input: unknown): Record<WorkspacePanelId, boolean> => {
    const result = { ...DEFAULT_HIDDEN };
    if (!input || typeof input !== 'object') return result;
    for (const id of WORKSPACE_PANEL_IDS) {
        const value = (input as Record<string, unknown>)[id];
        if (typeof value === 'boolean') result[id] = value;
    }
    return result;
};

const sanitizeSizes = <T extends string>(
    input: unknown,
    fallback: Record<T, number>,
    keys: readonly T[]
): Record<T, number> => {
    const result = { ...fallback };
    if (!input || typeof input !== 'object') return result;
    const source = input as Record<string, unknown>;
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            result[key] = clamp(Math.round(value), MIN_STORED_SIZE, MAX_STORED_SIZE);
        }
    }
    return result;
};

const readStoredLayout = (): PersistedLayout | null => {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedLayout | null;
        return parsed && parsed.version === STORAGE_VERSION ? parsed : null;
    } catch {
        return null;
    }
};

interface WorkspacePanelsState {
    /** Stacked panel sections per dock, top to bottom. */
    sections: DockSections;
    hidden: Record<WorkspacePanelId, boolean>;
    widths: Record<VerticalDockSide, number>;
    heights: Record<HorizontalDockSide, number>;
    /** Panel currently being dragged; drives the drop overlays. */
    dragging: WorkspacePanelId | null;
    /** Show + activate a panel, or hide it when it is already the active tab of its section. */
    toggle: (id: WorkspacePanelId) => void;
    activate: (id: WorkspacePanelId) => void;
    /** Move a tab to where it was dropped; used for reordering, re-docking and splitting. */
    moveTab: (id: WorkspacePanelId, drop: TabDrop) => void;
    setWidth: (side: VerticalDockSide, width: number) => void;
    setHeight: (side: HorizontalDockSide, height: number) => void;
    /** Restore the factory docking layout. */
    reset: () => void;
    setDragging: (id: WorkspacePanelId | null) => void;
}

const createDefaultState = () => ({
    sections: cloneSections(DEFAULT_SECTIONS),
    hidden: { ...DEFAULT_HIDDEN },
    widths: { ...DEFAULT_WIDTHS },
    heights: { ...DEFAULT_HEIGHTS },
});

export const useWorkspacePanelsStore = create<WorkspacePanelsState>((set, get) => {
    const stored = readStoredLayout();
    return {
        sections: stored ? sectionsFromStored(stored.sections) : cloneSections(DEFAULT_SECTIONS),
        hidden: stored ? sanitizeHidden(stored.hidden) : { ...DEFAULT_HIDDEN },
        widths: stored ? sanitizeSizes(stored.widths, DEFAULT_WIDTHS, ['left', 'right']) : { ...DEFAULT_WIDTHS },
        heights: stored ? sanitizeSizes(stored.heights, DEFAULT_HEIGHTS, ['top', 'bottom']) : { ...DEFAULT_HEIGHTS },
        dragging: null,
        toggle: (id) => {
            const { hidden, sections } = get();
            const side = panelSide(sections, id);
            const index = panelSectionIndex(sections, side, id);
            if (index < 0) return;
            const section = sections[side][index];
            if (hidden[id]) {
                set({ hidden: { ...hidden, [id]: false }, sections: withActive(sections, side, index, id) });
                return;
            }
            if (section.active === id) {
                set({
                    hidden: { ...hidden, [id]: true },
                    sections: withActive(sections, side, index, firstVisible(section, { ...hidden, [id]: true }, id)),
                });
                return;
            }
            set({ sections: withActive(sections, side, index, id) });
        },
        activate: (id) =>
            set((state) => {
                const side = panelSide(state.sections, id);
                const index = panelSectionIndex(state.sections, side, id);
                if (index < 0) return { hidden: { ...state.hidden, [id]: false } };
                return {
                    hidden: { ...state.hidden, [id]: false },
                    sections: withActive(state.sections, side, index, id),
                };
            }),
        moveTab: (id, { side, sectionIndex, tabIndex, split }) =>
            set((state) => {
                const from = panelSide(state.sections, id);
                const fromSection = panelSectionIndex(state.sections, from, id);
                const sections = DOCK_SIDES.reduce((accumulator, dockSide) => {
                    accumulator[dockSide] = withoutTab(state.sections[dockSide], state.hidden, id);
                    return accumulator;
                }, {} as DockSections);
                const target = sections[side];
                if (split) {
                    target.splice(clamp(sectionIndex, 0, target.length), 0, { tabs: [id], active: id });
                } else {
                    const index = clamp(sectionIndex, 0, target.length);
                    if (index === target.length) {
                        // Nothing to join (an empty dock): start its first section.
                        target.push({ tabs: [id], active: id });
                    } else {
                        const section = target[index];
                        section.tabs.splice(clamp(tabIndex, 0, section.tabs.length), 0, id);
                        // Reordering inside one section must not steal focus from its active tab.
                        if (from !== side || fromSection !== index) section.active = id;
                    }
                }
                return { sections, hidden: { ...state.hidden, [id]: false } };
            }),
        setWidth: (side, width) => set((state) => ({ widths: { ...state.widths, [side]: width } })),
        setHeight: (side, height) => set((state) => ({ heights: { ...state.heights, [side]: height } })),
        reset: () => set(createDefaultState()),
        setDragging: (dragging) => set({ dragging }),
    };
});

// Layout is a view preference, not document state: it never dirties the scene and it is
// restored on the next launch. Only the persisted slice is written, and only when it changes.
if (typeof localStorage !== 'undefined') {
    const saveLayout = (state: WorkspacePanelsState) => {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    version: STORAGE_VERSION,
                    sections: state.sections,
                    hidden: state.hidden,
                    widths: state.widths,
                    heights: state.heights,
                })
            );
        } catch {
            // Storage unavailable (private mode, quota): the in-memory layout still works.
        }
    };
    useWorkspacePanelsStore.subscribe((state, previous) => {
        if (
            state.sections === previous.sections &&
            state.hidden === previous.hidden &&
            state.widths === previous.widths &&
            state.heights === previous.heights
        ) {
            return;
        }
        saveLayout(state);
    });
}
