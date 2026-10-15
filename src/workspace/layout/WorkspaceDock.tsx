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
    const [dragSession, setDragSession] = useState<null | { id: WorkspacePanelId; startX: number; startY: number }>(
        null
    );
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [sideHover, setSideHover] = useState(false);
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

    // Snap position (index in the full side list) for a pointer at x, from the tab midpoints.
    const insertionIndexForX = (x: number) => {
        for (const id of tabs) {
            const el = tabRefs.current[id];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (x < rect.left + rect.width / 2) return orderForSide.indexOf(id);
        }
        return orderForSide.length;
    };

    const handleTabPointerDown = (id: WorkspacePanelId) => (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        suppressTabClickRef.current = false;
        setDragSession({ id, startX: e.clientX, startY: e.clientY });
    };

    // Track the drag on window so it keeps working when the pointer leaves the tab.
    useEffect(() => {
        if (!dragSession) return;
        const { id, startX, startY } = dragSession;
        let moved = false;
        let lastX = startX;

        const onMove = (e: PointerEvent) => {
            lastX = e.clientX;
            if (!moved) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
                moved = true;
                suppressTabClickRef.current = true;
                setDragging(id);
            }
            const vw = window.innerWidth;
            const overOther = otherSide === 'left' ? e.clientX < vw * 0.25 : e.clientX > vw * 0.75;
            setSideHover(overOther);
            setDropIndex(overOther ? null : insertionIndexForX(e.clientX));
        };

        const finish = () => {
            setDragSession(null);
            if (moved) {
                const vw = window.innerWidth;
                const overOther = otherSide === 'left' ? lastX < vw * 0.25 : lastX > vw * 0.75;
                if (overOther) {
                    moveTab(id, otherSide, useWorkspacePanelsStore.getState().order[otherSide].length);
                } else {
                    moveTab(id, side, insertionIndexForX(lastX));
                }
            }
            setDragging(null);
            setDropIndex(null);
            setSideHover(false);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
        };
    }, [dragSession, otherSide, side, moveTab, setDragging]);

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

    const panel = (
        <div ref={dockRef} className="flex min-h-0 shrink-0 flex-col bg-panel border-border" style={{ width }}>
            <div
                className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1 shrink-0"
                role="tablist"
                aria-label="Workspace panels"
            >
                {tabs.map((id, index) => {
                    const fullIndex = orderForSide.indexOf(id);
                    return (
                        <React.Fragment key={id}>
                            {dropIndex === fullIndex && dragging ? (
                                <span className="dock-tab-guide" aria-hidden />
                            ) : null}
                            <button
                                ref={(el) => {
                                    tabRefs.current[id] = el;
                                }}
                                type="button"
                                role="tab"
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
                        </React.Fragment>
                    );
                })}
                {dropIndex === orderForSide.length && dragging ? <span className="dock-tab-guide" aria-hidden /> : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{panelBody(activeId!)}</div>
        </div>
    );

    const showDropZone = dragging != null && panelSide(order, dragging) !== side;
    const dropZone = (
        <div
            data-dock-target={otherSide}
            className={`pointer-events-none fixed top-12 bottom-0 z-[1090] w-1/4 ${
                otherSide === 'left' ? 'left-0 border-r' : 'right-0 border-l'
            } ${sideHover ? 'border-neutral-400 bg-neutral-100/15' : 'border-transparent bg-transparent'}`}
            aria-hidden
        >
            {sideHover ? (
                <span
                    className={`absolute top-1/2 -translate-y-1/2 h-16 w-[2px] rounded-full bg-neutral-200 ${
                        otherSide === 'left' ? 'right-0' : 'left-0'
                    }`}
                />
            ) : null}
        </div>
    );

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
            {showDropZone ? dropZone : null}
        </>
    );
};

export default WorkspaceDock;
