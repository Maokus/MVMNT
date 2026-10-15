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

/** A tab belongs to whichever dock group lists it. */
export const panelSide = (order: Record<DockSide, WorkspacePanelId[]>, id: WorkspacePanelId): DockSide =>
    order.left.includes(id) ? 'left' : 'right';

const DEFAULT_ORDER: Record<DockSide, WorkspacePanelId[]> = {
    left: ['assets'],
    right: ['elements', 'properties', 'macros'],
};

const DEFAULT_HIDDEN: Record<WorkspacePanelId, boolean> = {
    assets: false,
    elements: false,
    properties: false,
    macros: true,
};

interface WorkspacePanelsState {
    /** Tab order per dock group. */
    order: Record<DockSide, WorkspacePanelId[]>;
    hidden: Record<WorkspacePanelId, boolean>;
    active: Record<DockSide, WorkspacePanelId | null>;
    widths: Record<DockSide, number>;
    /** Panel currently being dragged; drives the snap-guide overlays. */
    dragging: WorkspacePanelId | null;
    /** Show + activate a panel, or hide it when it is already the active visible tab. */
    toggle: (id: WorkspacePanelId) => void;
    activate: (id: WorkspacePanelId) => void;
    /** Move a tab to a dock group at a position; used for both reordering and re-docking. */
    moveTab: (id: WorkspacePanelId, side: DockSide, index: number) => void;
    setWidth: (side: DockSide, width: number) => void;
    setDragging: (id: WorkspacePanelId | null) => void;
}

const firstVisible = (ids: WorkspacePanelId[], hidden: Record<WorkspacePanelId, boolean>, exclude?: WorkspacePanelId) =>
    ids.find((id) => id !== exclude && !hidden[id]) ?? null;

export const useWorkspacePanelsStore = create<WorkspacePanelsState>((set, get) => ({
    order: { left: [...DEFAULT_ORDER.left], right: [...DEFAULT_ORDER.right] },
    hidden: { ...DEFAULT_HIDDEN },
    active: { left: 'assets', right: 'elements' },
    widths: { left: 220, right: 320 },
    dragging: null,
    toggle: (id) => {
        const { hidden, active, order } = get();
        const side = panelSide(order, id);
        if (hidden[id]) {
            set({ hidden: { ...hidden, [id]: false }, active: { ...active, [side]: id } });
            return;
        }
        if (active[side] === id) {
            set({
                hidden: { ...hidden, [id]: true },
                active: { ...active, [side]: firstVisible(order[side], { ...hidden, [id]: true }, id) },
            });
            return;
        }
        set({ active: { ...active, [side]: id } });
    },
    activate: (id) =>
        set((state) => ({
            hidden: { ...state.hidden, [id]: false },
            active: { ...state.active, [panelSide(state.order, id)]: id },
        })),
    moveTab: (id, side, index) =>
        set((state) => {
            const from = panelSide(state.order, id);
            const fromList = state.order[from].filter((panel) => panel !== id);
            const toList = state.order[side].filter((panel) => panel !== id);
            toList.splice(Math.max(0, Math.min(index, toList.length)), 0, id);
            // Reordering inside one group must not steal focus from the active tab.
            if (from === side) return { order: { ...state.order, [side]: toList } };
            const active = { ...state.active, [side]: id };
            if (state.active[from] === id) active[from] = firstVisible(fromList, state.hidden);
            return {
                order: { ...state.order, [from]: fromList, [side]: toList },
                hidden: { ...state.hidden, [id]: false },
                active,
            };
        }),
    setWidth: (side, width) => set((state) => ({ widths: { ...state.widths, [side]: width } })),
    setDragging: (dragging) => set({ dragging }),
}));
