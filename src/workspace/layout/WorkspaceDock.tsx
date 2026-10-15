import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FloatingFocusManager,
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import { SceneElementPanel, ElementDropdown } from '@workspace/panels/scene-element';
import { Button } from '@workspace/components/Button';
import { PropertiesPanel } from '@workspace/panels/properties';
import AssetManagerPanel from '@workspace/panels/asset-manager/AssetManagerPanel';
import MacroConfig from '@workspace/panels/properties/MacroConfig';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useVisualizer } from '@context/VisualizerContext';
import { clamp } from '@math/transforms/numeric';
import {
    useWorkspacePanelsStore,
    panelSide,
    WORKSPACE_PANEL_LABELS,
    type DockSide,
    type WorkspacePanelId,
} from '@state/workspacePanelsStore';

const MIN_WIDTH = 180;
const MAX_WIDTH = 640;
const RESIZER_THICKNESS = 6;
const MENUBAR_HEIGHT = 48;
const DOCK_ACCENT = '#3794ff';

interface DockRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

const isInsideRect = (x: number, y: number, rect: DockRect): boolean =>
    x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;

interface WorkspaceDockProps {
    side: DockSide;
}

/**
 * One dock group (left or right) holding whichever tabs are assigned to that
 * side. Tabs drag within the strip to reorder (snap guide between tabs) or onto
 * the opposite workspace edge to re-dock just that tab (highlighted snap zone).
 */
const WorkspaceDock: React.FC<WorkspaceDockProps> = ({ side }) => {
    const order = useWorkspacePanelsStore((state) => state.order);
    const orderForSide = useWorkspacePanelsStore((state) => state.order[side]);
    const hidden = useWorkspacePanelsStore((state) => state.hidden);
    const activeId = useWorkspacePanelsStore((state) => state.active[side]);
    const width = useWorkspacePanelsStore((state) => state.widths[side]);
    const dragging = useWorkspacePanelsStore((state) => state.dragging);
    const activate = useWorkspacePanelsStore((state) => state.activate);
    const moveTab = useWorkspacePanelsStore((state) => state.moveTab);
    const setWidth = useWorkspacePanelsStore((state) => state.setWidth);
    const setDragging = useWorkspacePanelsStore((state) => state.setDragging);

    const otherSide: DockSide = side === 'left' ? 'right' : 'left';
    const dockRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Partial<Record<WorkspacePanelId, HTMLButtonElement | null>>>({});
    const suppressTabClickRef = useRef(false);
    // The gesture lives in a ref so the window listeners can stay attached for the
    // whole drag; they are registered once on mount and never miss a pointermove.
    const dragRef = useRef<null | {
        id: WorkspacePanelId;
        startX: number;
        startY: number;
        lastX: number;
        lastY: number;
        moved: boolean;
    }>(null);
    const [guideLeft, setGuideLeft] = useState<number | null>(null);
    const [sideHover, setSideHover] = useState(false);
    const [dragPoint, setDragPoint] = useState<null | { x: number; y: number }>(null);
    const [dropRect, setDropRect] = useState<null | DockRect>(null);
    const [dropLine, setDropLine] = useState<number | null>(null);
    const resizeRef = useRef<null | { startX: number; startWidth: number }>(null);
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);

    const tabs = useMemo(() => orderForSide.filter((id) => !hidden[id]), [orderForSide, hidden]);
    const activeVisible = activeId != null && !hidden[activeId];

    const {
        exportSettings,
        debugSettings,
        exportSequence,
        exportStatus,
        visualizer,
        setExportSettings,
        setDebugSettings,
        canvasRef,
    } = useVisualizer() as any;
    const canExport = !!(visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0);
    const {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        propertyPanelRefresh,
        clearSelection,
        updateElementConfig,
        addElement,
    } = useSceneSelection();

    // Keep selection-clearing behaviour from the old side panels, now scoped to the dock.
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const composed = typeof event.composedPath === 'function' ? event.composedPath() : [];
            const preserveSelection = (composed as EventTarget[]).some(
                (node) => node instanceof HTMLElement && node.dataset?.preserveSelection === 'true'
            );
            if (preserveSelection) return;
            const clickedInsideDock = dockRef.current?.contains(event.target as Node);
            const canvasEl: HTMLCanvasElement | null =
                canvasRef?.current || (document.getElementById('canvas') as HTMLCanvasElement | null);
            const previewContainer =
                canvasEl?.closest('[data-preview-container]') ||
                canvasEl?.closest('.canvas-container') ||
                canvasEl?.closest('.preview-panel');
            const clickedInsideCanvas = !!(
                (canvasEl && canvasEl.contains(event.target as Node)) ||
                (previewContainer && previewContainer.contains(event.target as Node))
            );
            if (!clickedInsideDock && !clickedInsideCanvas && selectedElementId) clearSelection();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedElementId, clearSelection, canvasRef]);

    const {
        refs: addElementRefs,
        floatingStyles: addElementFloatingStyles,
        context: addElementContext,
    } = useFloating({
        open: showAddElementDropdown,
        onOpenChange: setShowAddElementDropdown,
        placement: 'bottom-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    });
    const addElementDismiss = useDismiss(addElementContext, { outsidePressEvent: 'mousedown' });
    const addElementRole = useRole(addElementContext, { role: 'menu' });
    const { getReferenceProps: getAddElementReferenceProps, getFloatingProps: getAddElementFloatingProps } =
        useInteractions([addElementDismiss, addElementRole]);

    const handleAddElementAndCloseDropdown = (elementType: string) => {
        addElement(elementType);
        setShowAddElementDropdown(false);
    };

    const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
        resizeRef.current = { startX: e.clientX, startWidth: width };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };
    const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = resizeRef.current;
        if (!state) return;
        const delta = (e.clientX - state.startX) * (side === 'right' ? -1 : 1);
        setWidth(side, clamp(state.startWidth + delta, MIN_WIDTH, MAX_WIDTH));
    };
    const handleResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!resizeRef.current) return;
        resizeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
    };

    // Visible tabs for this side, read from the store at call time so the drag
    // handlers stay valid for the whole gesture without re-subscribing.
    const readSideTabs = useCallback(() => {
        const state = useWorkspacePanelsStore.getState();
        const sideOrder = state.order[side];
        return { sideOrder, visible: sideOrder.filter((id) => !state.hidden[id]) };
    }, [side]);

    // Snap position (index in the full side list) for a pointer at x, from the tab midpoints.
    const insertionIndexForX = useCallback(
        (x: number) => {
            const { sideOrder, visible } = readSideTabs();
            for (const id of visible) {
                const el = tabRefs.current[id];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (x < rect.left + rect.width / 2) return sideOrder.indexOf(id);
            }
            return sideOrder.length;
        },
        [readSideTabs]
    );

    // Horizontal offset, relative to the dock, where the snap guide should be drawn.
    const guideLeftForX = useCallback(
        (x: number): number => {
            const dockEl = dockRef.current;
            if (!dockEl) return 0;
            const dockLeft = dockEl.getBoundingClientRect().left;
            const { visible } = readSideTabs();
            for (const id of visible) {
                const el = tabRefs.current[id];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (x < rect.left + rect.width / 2) return Math.max(0, rect.left - dockLeft);
            }
            const tailId = visible[visible.length - 1];
            const tailEl = tailId ? tabRefs.current[tailId] : null;
            return tailEl ? tailEl.getBoundingClientRect().right - dockLeft : 0;
        },
        [readSideTabs]
    );

    // Real bounds of the opposite dock, so the drop highlight covers exactly where the
    // tab will land. Falls back to the strip the dock would occupy when that side has no
    // visible panel: this dock's vertical extent (never the timeline below it) and the
    // width the panel is configured to take there.
    const otherDockRect = useCallback((): DockRect => {
        const el = document.querySelector<HTMLElement>(`[data-dock-side="${otherSide}"]`);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                return { left: r.left, top: r.top, width: r.width, height: r.height };
            }
        }
        const own = dockRef.current?.getBoundingClientRect();
        const top = own && own.height > 0 ? own.top : MENUBAR_HEIGHT;
        const height = own && own.height > 0 ? own.height : window.innerHeight - MENUBAR_HEIGHT;
        const vw = window.innerWidth;
        const preferred = useWorkspacePanelsStore.getState().widths[otherSide];
        const width = clamp(preferred || Math.round(vw * 0.25), MIN_WIDTH, MAX_WIDTH);
        return otherSide === 'left' ? { left: 0, top, width, height } : { left: vw - width, top, width, height };
    }, [otherSide]);

    // Where a release at x would insert into the opposite dock: the index to move to,
    // plus where that boundary sits inside the dock for the guide. Reads that dock's own
    // tabs, so the tab can land next to any tab rather than only at the end.
    const otherDockInsertion = useCallback(
        (x: number): { index: number; left: number | null } => {
            const sideOrder = useWorkspacePanelsStore.getState().order[otherSide];
            const root = document.querySelector<HTMLElement>(`[data-dock-side="${otherSide}"]`);
            const tabs = root ? Array.from(root.querySelectorAll<HTMLElement>('[data-panel-id]')) : [];
            const dockLeft = root ? root.getBoundingClientRect().left : 0;
            for (const el of tabs) {
                const rect = el.getBoundingClientRect();
                if (x < rect.left + rect.width / 2) {
                    return {
                        index: sideOrder.indexOf(el.dataset.panelId as WorkspacePanelId),
                        left: rect.left - dockLeft,
                    };
                }
            }
            const tail = tabs[tabs.length - 1];
            return {
                index: sideOrder.length,
                left: tail ? tail.getBoundingClientRect().right - dockLeft : null,
            };
        },
        [otherSide]
    );

    const handleTabPointerDown = (id: WorkspacePanelId) => (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        suppressTabClickRef.current = false;
        dragRef.current = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            moved: false,
        };
    };

    // Window-level listeners are attached once, so a drag keeps working when the
    // pointer leaves the tab and the first move after pointerdown is never missed.
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const session = dragRef.current;
            if (!session) return;
            session.lastX = e.clientX;
            session.lastY = e.clientY;
            if (!session.moved) {
                if (Math.hypot(e.clientX - session.startX, e.clientY - session.startY) < 4) return;
                session.moved = true;
                suppressTabClickRef.current = true;
                setDragging(session.id);
            }
            // The opposite dock is highlighted for the whole drag; it lights up fully
            // once the pointer is actually inside it, which is where the tab will land.
            const rect = otherDockRect();
            const over = isInsideRect(e.clientX, e.clientY, rect);
            setDropRect(rect);
            setSideHover(over);
            setDropLine(over ? otherDockInsertion(e.clientX).left : null);
            setDragPoint({ x: e.clientX, y: e.clientY });
            // Track the in-dock snap position for the whole drag so its guide never disappears.
            setGuideLeft(guideLeftForX(e.clientX));
        };

        const finish = () => {
            const session = dragRef.current;
            if (!session) return;
            dragRef.current = null;
            setDragging(null);
            setGuideLeft(null);
            setSideHover(false);
            setDropLine(null);
            setDragPoint(null);
            setDropRect(null);
            if (!session.moved) return;
            if (isInsideRect(session.lastX, session.lastY, otherDockRect())) {
                moveTab(session.id, otherSide, otherDockInsertion(session.lastX).index);
            } else {
                moveTab(session.id, side, insertionIndexForX(session.lastX));
            }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
    }, [otherSide, side, moveTab, setDragging, guideLeftForX, insertionIndexForX, otherDockRect, otherDockInsertion]);

    const panelBody = useCallback(
        (id: WorkspacePanelId) => {
            switch (id) {
                case 'assets':
                    return <AssetManagerPanel />;
                case 'macros':
                    return (
                        <div className="flex-1 overflow-y-auto p-3">
                            <MacroConfig visualizer={visualizer} />
                        </div>
                    );
                case 'properties':
                    return (
                        <div className="flex-1 overflow-y-auto p-0 space-y-4">
                            <div className="properties-config" id="propertiesConfig">
                                <PropertiesPanel
                                    element={selectedElement}
                                    schema={selectedElementSchema || undefined}
                                    refreshToken={propertyPanelRefresh}
                                    onConfigChange={updateElementConfig}
                                    onExport={exportSequence}
                                    exportStatus={exportStatus}
                                    canExport={canExport}
                                    exportSettings={exportSettings}
                                    onExportSettingsChange={setExportSettings}
                                    debugSettings={debugSettings}
                                    onDebugSettingsChange={setDebugSettings}
                                />
                            </div>
                        </div>
                    );
                case 'elements':
                default:
                    return (
                        <>
                            <div className="inspector-panel-header">
                                <h3 className="inspector-panel-header__title">Elements</h3>
                                <div className="relative">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        {...getAddElementReferenceProps({
                                            type: 'button',
                                            onClick: () => setShowAddElementDropdown((prev) => !prev),
                                            title: 'Add element',
                                        })}
                                        ref={addElementRefs.setReference}
                                    >
                                        + Add
                                    </Button>
                                    {showAddElementDropdown && (
                                        <FloatingPortal>
                                            <FloatingFocusManager
                                                context={addElementContext}
                                                modal={false}
                                                initialFocus={-1}
                                            >
                                                <div
                                                    {...getAddElementFloatingProps({})}
                                                    ref={addElementRefs.setFloating}
                                                    style={addElementFloatingStyles}
                                                    className="z-[1000]"
                                                >
                                                    <ElementDropdown
                                                        className="mt-2"
                                                        onAddElement={handleAddElementAndCloseDropdown}
                                                        onClose={() => setShowAddElementDropdown(false)}
                                                    />
                                                </div>
                                            </FloatingFocusManager>
                                        </FloatingPortal>
                                    )}
                                </div>
                            </div>
                            <div className="inspector-elements-scroll">
                                <SceneElementPanel />
                            </div>
                        </>
                    );
            }
        },
        [
            addElementContext,
            addElementRefs,
            canExport,
            debugSettings,
            exportSequence,
            exportSettings,
            exportStatus,
            getAddElementFloatingProps,
            getAddElementReferenceProps,
            propertyPanelRefresh,
            selectedElement,
            selectedElementSchema,
            setDebugSettings,
            setExportSettings,
            updateElementConfig,
            visualizer,
        ]
    );

    const resizer = (
        <div
            className="relative h-full shrink-0 cursor-col-resize bg-neutral-900 border-l border-r border-neutral-800 transition-colors hover:bg-neutral-800"
            style={{ width: RESIZER_THICKNESS }}
            onPointerDown={handleResizeDown}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onPointerCancel={handleResizeUp}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
        >
            <div className="absolute top-1/2 left-1/2 w-[2px] h-12 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
        </div>
    );

    // Full-height drop guide, drawn across the whole dock so the snap position is
    // unmistakable. Inline styles keep it independent of stylesheet state.
    const guideStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 3,
        marginLeft: -1,
        backgroundColor: DOCK_ACCENT,
        pointerEvents: 'none',
        zIndex: 30,
    };

    const panel = (
        <div
            ref={dockRef}
            data-dock-side={side}
            className="relative flex min-h-0 shrink-0 flex-col bg-panel border-border"
            style={{ width }}
        >
            <div
                className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1 shrink-0"
                role="tablist"
                aria-label="Workspace panels"
            >
                {tabs.map((id) => (
                    <button
                        key={id}
                        ref={(el) => {
                            tabRefs.current[id] = el;
                        }}
                        type="button"
                        role="tab"
                        data-panel-id={id}
                        aria-selected={activeId === id}
                        onPointerDown={handleTabPointerDown(id)}
                        onClick={() => {
                            if (suppressTabClickRef.current) {
                                suppressTabClickRef.current = false;
                                return;
                            }
                            activate(id);
                        }}
                        className={`cursor-grab touch-none rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                            activeId === id
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                        } ${dragging === id ? 'cursor-grabbing opacity-50' : ''}`}
                    >
                        {WORKSPACE_PANEL_LABELS[id]}
                    </button>
                ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{panelBody(activeId!)}</div>
            {dragging && guideLeft != null ? (
                <span data-dock-guide="true" aria-hidden style={{ ...guideStyle, left: guideLeft }} />
            ) : null}
        </div>
    );

    // The dock that owns the dragged tab draws the highlight for the opposite dock: it
    // is the one that knows the pointer position. A soft tint marks the other side as a
    // drop target for the whole drag, and the accent bar plus a stronger tint appear
    // once the pointer is actually inside it, i.e. when releasing would re-dock.
    const showDropZone = dragging != null && panelSide(order, dragging) === side;
    const dropZone = dropRect ? (
        <div
            data-dock-target={otherSide}
            className="pointer-events-none fixed z-[1090] overflow-hidden"
            style={{ left: dropRect.left, top: dropRect.top, width: dropRect.width, height: dropRect.height }}
            aria-hidden
        >
            <div
                className="absolute inset-0 transition-colors"
                style={{ backgroundColor: sideHover ? 'rgba(55,148,255,0.24)' : 'rgba(55,148,255,0.08)' }}
            />
            {sideHover && dropLine != null ? (
                <div
                    data-drop-line="true"
                    className="absolute top-0 bottom-0 transition-colors"
                    style={{ left: dropLine, width: 3, marginLeft: -1, backgroundColor: DOCK_ACCENT }}
                />
            ) : null}
            {sideHover ? (
                <div
                    data-drop-bar="true"
                    className="absolute top-0 bottom-0"
                    style={{
                        [otherSide === 'left' ? 'right' : 'left']: 0,
                        width: 6,
                        backgroundColor: DOCK_ACCENT,
                    }}
                />
            ) : null}
        </div>
    ) : null;

    // Floating chip that follows the pointer, so the drag reads clearly even when the
    // tab itself is dimmed and the pointer has left the strip.
    const dragChip =
        dragging && dragPoint ? (
            <div
                data-drag-chip="true"
                className="pointer-events-none fixed z-[1200] -translate-y-1/2"
                style={{ left: dragPoint.x + 14, top: dragPoint.y }}
                aria-hidden
            >
                <span
                    className="rounded px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: '#0e639c', color: '#ffffff' }}
                >
                    {WORKSPACE_PANEL_LABELS[dragging]}
                </span>
            </div>
        ) : null;

    return (
        <>
            {activeVisible ? (
                side === 'left' ? (
                    <>
                        {panel}
                        {resizer}
                    </>
                ) : (
                    <>
                        {resizer}
                        {panel}
                    </>
                )
            ) : null}
            {showDropZone && dropRect ? dropZone : null}
            {dragChip}
        </>
    );
};

export default WorkspaceDock;
