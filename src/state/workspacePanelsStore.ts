import { create } from 'zustand';

export type WorkspacePanelId = 'assets' | 'elements' | 'properties' | 'macros';
export type DockSide = 'left' | 'right';

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

const DEFAULT_SECTIONS: DockSections = {
    left: [{ tabs: ['assets'], active: 'assets' }],
    right: [{ tabs: ['elements', 'properties', 'macros'], active: 'elements' }],
};

const DEFAULT_HIDDEN: Record<WorkspacePanelId, boolean> = {
    assets: false,
    elements: false,
    properties: false,
    macros: true,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** A panel belongs to whichever dock lists it. */
export const panelSide = (sections: DockSections, id: WorkspacePanelId): DockSide =>
    sections.left.some((section) => section.tabs.includes(id)) ? 'left' : 'right';

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

interface WorkspacePanelsState {
    /** Stacked panel sections per dock, top to bottom. */
    sections: DockSections;
    hidden: Record<WorkspacePanelId, boolean>;
    widths: Record<DockSide, number>;
    /** Panel currently being dragged; drives the drop overlays. */
    dragging: WorkspacePanelId | null;
    /** Show + activate a panel, or hide it when it is already the active tab of its section. */
    toggle: (id: WorkspacePanelId) => void;
    activate: (id: WorkspacePanelId) => void;
    /** Move a tab to where it was dropped; used for reordering, re-docking and splitting. */
    moveTab: (id: WorkspacePanelId, drop: TabDrop) => void;
    setWidth: (side: DockSide, width: number) => void;
    setDragging: (id: WorkspacePanelId | null) => void;
}

export const useWorkspacePanelsStore = create<WorkspacePanelsState>((set, get) => ({
    sections: {
        left: DEFAULT_SECTIONS.left.map((section) => ({ ...section, tabs: [...section.tabs] })),
        right: DEFAULT_SECTIONS.right.map((section) => ({ ...section, tabs: [...section.tabs] })),
    },
    hidden: { ...DEFAULT_HIDDEN },
    widths: { left: 220, right: 320 },
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
            const sections: DockSections = {
                left: withoutTab(state.sections.left, state.hidden, id),
                right: withoutTab(state.sections.right, state.hidden, id),
            };
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
    setDragging: (dragging) => set({ dragging }),
}));
