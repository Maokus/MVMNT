import { create } from 'zustand';

export type WorkspacePanelId = 'assets' | 'elements' | 'properties' | 'macros';
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export type VerticalDockSide = 'left' | 'right';
export type HorizontalDockSide = 'top' | 'bottom';

export const DOCK_SIDES: DockSide[] = ['left', 'right', 'top', 'bottom'];

export const WORKSPACE_PANEL_IDS: WorkspacePanelId[] = ['assets', 'elements', 'properties', 'macros'];

export const WORKSPACE_PANEL_LABELS: Record<WorkspacePanelId, string> = {
    assets: 'Assets',
    elements: 'Elements',
    properties: 'Properties',
    macros: 'Macros',
};

export interface DockSection {
    tabs: WorkspacePanelId[];
    active: WorkspacePanelId | null;
}

export type DockSections = Record<DockSide, DockSection[]>;

export type DockSectionWeights = Record<VerticalDockSide, number[]>;

export interface TabDrop {
    side: DockSide;
    sectionIndex: number;
    tabIndex: number;
    split: boolean;
}

const STORAGE_KEY = 'mvmnt.workspace-layout';
const STORAGE_VERSION = 1;
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
const DEFAULT_SECTION_WEIGHTS: DockSectionWeights = { left: [1], right: [1] };
const MIN_SECTION_WEIGHT = 0.02;
const MAX_SECTION_WEIGHT = 40;

const cloneSectionWeights = (): DockSectionWeights => ({
    left: [...DEFAULT_SECTION_WEIGHTS.left],
    right: [...DEFAULT_SECTION_WEIGHTS.right],
});

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

export const panelSide = (sections: DockSections, id: WorkspacePanelId): DockSide =>
    DOCK_SIDES.find((side) => sections[side].some((section) => section.tabs.includes(id))) ?? 'right';

export const panelSectionIndex = (sections: DockSections, side: DockSide, id: WorkspacePanelId): number =>
    sections[side].findIndex((section) => section.tabs.includes(id));

export const isPanelVisible = (
    sections: DockSections,
    hidden: Record<WorkspacePanelId, boolean>,
    id: WorkspacePanelId
): boolean => {
    if (hidden[id]) return false;
    const side = panelSide(sections, id);
    return panelSectionIndex(sections, side, id) >= 0;
};

const firstVisible = (section: DockSection, hidden: Record<WorkspacePanelId, boolean>, exclude?: WorkspacePanelId) =>
    section.tabs.find((id) => id !== exclude && !hidden[id]) ?? null;

export const normalizeSectionWeights = (weights: number[] | undefined, count: number): number[] =>
    Array.from({ length: count }, (_, index) => {
        const value = weights?.[index];
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1;
    });

export const dragSectionWeight = (weights: number[], index: number, delta: number, min: number): number[] => {
    if (index < 0 || index + 1 >= weights.length) return weights;
    const pairSum = weights[index] + weights[index + 1];
    if (!(pairSum > 0)) return weights;
    const floor = Math.min(min, pairSum / 2);
    const next = [...weights];
    next[index] = clamp(weights[index] + delta, floor, pairSum - floor);
    next[index + 1] = pairSum - next[index];
    return next;
};

const withActive = (
    sections: DockSections,
    side: DockSide,
    index: number,
    active: WorkspacePanelId | null
): DockSections => ({ ...sections, [side]: sections[side].map((s, i) => (i === index ? { ...s, active } : s)) });

const withoutTab = (list: DockSection[], hidden: Record<WorkspacePanelId, boolean>, id: WorkspacePanelId) =>
    list
        .map((section) =>
            section.tabs.includes(id)
                ? {
                      tabs: section.tabs.filter((tab) => tab !== id),
                      active: section.active === id ? firstVisible(section, hidden, id) : section.active,
                  }
                : { tabs: [...section.tabs], active: section.active }
        )
        .filter((section) => section.tabs.length > 0);

interface PersistedLayout {
    version?: unknown;
    sections?: unknown;
    hidden?: unknown;
    widths?: unknown;
    heights?: unknown;
    sectionWeights?: unknown;
}

const sanitizeSections = (input: unknown): DockSections => {
    const result: DockSections = { left: [], right: [], top: [], bottom: [] };
    if (!input || typeof input !== 'object') return result;
    const source = input as Record<string, unknown>;
    const seen = new Set<WorkspacePanelId>();
    for (const side of DOCK_SIDES) {
        const list = source[side];
        if (!Array.isArray(list)) continue;
        result[side] = list
            .map((raw): DockSection | null => {
                if (!raw || typeof raw !== 'object') return null;
                const entry = raw as { tabs?: unknown; active?: unknown };
                // Each panel may appear once in the whole layout, or two sections would mount it twice.
                const tabs = (Array.isArray(entry.tabs) ? entry.tabs.filter(isPanelId) : []).filter((id) => {
                    if (seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                if (tabs.length === 0) return null;
                const active = isPanelId(entry.active) && tabs.includes(entry.active) ? entry.active : tabs[0];
                return { tabs, active };
            })
            .filter((section): section is DockSection => section != null);
    }
    return result;
};

// A panel missing from a stored layout (older save, or a panel added in a later release) cannot be
// recovered by activate(), so it is re-docked at the default dock's last section here.
const withMissingPanels = (sections: DockSections): DockSections => {
    const present = new Set(DOCK_SIDES.flatMap((side) => sections[side].flatMap((section) => section.tabs)));
    const result = cloneSections(sections);
    for (const id of WORKSPACE_PANEL_IDS) {
        if (present.has(id)) continue;
        const side =
            DOCK_SIDES.find((candidate) => DEFAULT_SECTIONS[candidate].some((section) => section.tabs.includes(id))) ??
            'right';
        const last = result[side][result[side].length - 1];
        if (last) last.tabs.push(id);
        else result[side].push({ tabs: [id], active: id });
    }
    return result;
};

export const sectionsFromStored = (input: unknown): DockSections => withMissingPanels(sanitizeSections(input));

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

const sanitizeSectionWeights = (input: unknown): DockSectionWeights => {
    const result = cloneSectionWeights();
    if (!input || typeof input !== 'object') return result;
    const source = input as Record<string, unknown>;
    for (const side of ['left', 'right'] as VerticalDockSide[]) {
        const list = source[side];
        if (!Array.isArray(list)) continue;
        const values = list
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
            .map((value) => clamp(value, MIN_SECTION_WEIGHT, MAX_SECTION_WEIGHT));
        if (values.length > 0) result[side] = values;
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
    sections: DockSections;
    hidden: Record<WorkspacePanelId, boolean>;
    widths: Record<VerticalDockSide, number>;
    heights: Record<HorizontalDockSide, number>;
    sectionWeights: DockSectionWeights;
    dragging: WorkspacePanelId | null;
    toggle: (id: WorkspacePanelId) => void;
    activate: (id: WorkspacePanelId) => void;
    moveTab: (id: WorkspacePanelId, drop: TabDrop) => void;
    setWidth: (side: VerticalDockSide, width: number) => void;
    setHeight: (side: HorizontalDockSide, height: number) => void;
    setSectionWeights: (side: VerticalDockSide, weights: number[]) => void;
    reset: () => void;
    setDragging: (id: WorkspacePanelId | null) => void;
}

const createDefaultState = () => ({
    sections: cloneSections(DEFAULT_SECTIONS),
    hidden: { ...DEFAULT_HIDDEN },
    widths: { ...DEFAULT_WIDTHS },
    heights: { ...DEFAULT_HEIGHTS },
    sectionWeights: cloneSectionWeights(),
});

export const useWorkspacePanelsStore = create<WorkspacePanelsState>((set, get) => {
    const stored = readStoredLayout();
    return {
        sections: stored ? sectionsFromStored(stored.sections) : cloneSections(DEFAULT_SECTIONS),
        hidden: stored ? sanitizeHidden(stored.hidden) : { ...DEFAULT_HIDDEN },
        widths: stored ? sanitizeSizes(stored.widths, DEFAULT_WIDTHS, ['left', 'right']) : { ...DEFAULT_WIDTHS },
        heights: stored ? sanitizeSizes(stored.heights, DEFAULT_HEIGHTS, ['top', 'bottom']) : { ...DEFAULT_HEIGHTS },
        sectionWeights: stored ? sanitizeSectionWeights(stored.sectionWeights) : cloneSectionWeights(),
        dragging: null,
        toggle: (id) => {
            const { hidden, sections } = get();
            const side = panelSide(sections, id);
            const index = panelSectionIndex(sections, side, id);
            if (index < 0) return;
            const section = sections[side][index];
            if (!hidden[id]) {
                set({
                    hidden: { ...hidden, [id]: true },
                    sections: withActive(
                        sections,
                        side,
                        index,
                        section.active === id ? firstVisible(section, { ...hidden, [id]: true }, id) : section.active
                    ),
                });
                return;
            }
            set({ hidden: { ...hidden, [id]: false }, sections: withActive(sections, side, index, id) });
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
                const sourceIndex = fromSection >= 0 ? state.sections[from][fromSection].tabs.indexOf(id) : -1;
                const sameSection = from === side && fromSection === sectionIndex;
                if (!split && sameSection && state.sections[from][fromSection].tabs.length === 1) {
                    return { hidden: { ...state.hidden, [id]: false } };
                }
                const removedEarlierSection =
                    from === side &&
                    fromSection >= 0 &&
                    fromSection < sectionIndex &&
                    state.sections[from][fromSection].tabs.length === 1;
                const destinationIndex = sectionIndex - (removedEarlierSection ? 1 : 0);
                const sections = DOCK_SIDES.reduce((accumulator, dockSide) => {
                    accumulator[dockSide] = withoutTab(state.sections[dockSide], state.hidden, id);
                    return accumulator;
                }, {} as DockSections);
                const target = sections[side];
                if (split) {
                    target.splice(clamp(destinationIndex, 0, target.length), 0, { tabs: [id], active: id });
                } else {
                    const index = clamp(destinationIndex, 0, target.length);
                    if (index === target.length) {
                        target.push({ tabs: [id], active: id });
                    } else {
                        const section = target[index];
                        // Reordering rightward in the same strip: removing the tab shifted every later slot left.
                        const reorderShift = sameSection && sourceIndex < tabIndex ? 1 : 0;
                        section.tabs.splice(clamp(tabIndex - reorderShift, 0, section.tabs.length), 0, id);
                        section.active = sameSection ? state.sections[from][fromSection].active : id;
                    }
                }
                return { sections, hidden: { ...state.hidden, [id]: false } };
            }),
        setWidth: (side, width) => set((state) => ({ widths: { ...state.widths, [side]: width } })),
        setHeight: (side, height) => set((state) => ({ heights: { ...state.heights, [side]: height } })),
        setSectionWeights: (side, weights) =>
            set((state) => ({ sectionWeights: { ...state.sectionWeights, [side]: weights } })),
        reset: () => set(createDefaultState()),
        setDragging: (dragging) => set({ dragging }),
    };
});

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
                    sectionWeights: state.sectionWeights,
                })
            );
        } catch {}
    };
    useWorkspacePanelsStore.subscribe((state, previous) => {
        if (
            state.sections === previous.sections &&
            state.hidden === previous.hidden &&
            state.widths === previous.widths &&
            state.heights === previous.heights &&
            state.sectionWeights === previous.sectionWeights
        ) {
            return;
        }
        saveLayout(state);
    });
}
