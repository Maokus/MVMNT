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
    DOCK_SIDES,
    useWorkspacePanelsStore,
    panelSide,
    panelSectionIndex,
    normalizeSectionWeights,
    dragSectionWeight,
    WORKSPACE_PANEL_LABELS,
    type DockSide,
    type VerticalDockSide,
    type WorkspacePanelId,
} from '@state/workspacePanelsStore';
import { DockGuide } from './DockGuide';
import { resolveDockZone, type DockZone } from './dockZone';

const MIN_WIDTH = 180;
const MAX_WIDTH = 640;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 480;
const MIN_SECTION_HEIGHT = 96;
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

const dockElement = (side: DockSide): HTMLElement | null =>
    document.querySelector<HTMLElement>(`[data-dock-side="${side}"]`);

const centerColumnRect = (): DockRect | null => {
    const el = document.querySelector<HTMLElement>('[data-center-column]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
};

interface DropTarget {
    side: DockSide;
    sectionIndex: number;
    tabIndex: number;
    split: boolean;
    rect: DockRect;
    line: number | null;
    zone?: DockZone;
    zoneRect?: DockRect;
}

interface WorkspaceDockProps {
    side: DockSide;
}

const WorkspaceDock: React.FC<WorkspaceDockProps> = ({ side }) => {
    const sections = useWorkspacePanelsStore((state) => state.sections);
    const hidden = useWorkspacePanelsStore((state) => state.hidden);
    const size = useWorkspacePanelsStore((state) =>
        side === 'top'
            ? state.heights.top
            : side === 'bottom'
              ? state.heights.bottom
              : side === 'left'
                ? state.widths.left
                : state.widths.right
    );
    const dragging = useWorkspacePanelsStore((state) => state.dragging);
    const activate = useWorkspacePanelsStore((state) => state.activate);
    const moveTab = useWorkspacePanelsStore((state) => state.moveTab);
    const setWidth = useWorkspacePanelsStore((state) => state.setWidth);
    const setHeight = useWorkspacePanelsStore((state) => state.setHeight);
    const sectionWeights = useWorkspacePanelsStore((state) => state.sectionWeights);
    const setSectionWeights = useWorkspacePanelsStore((state) => state.setSectionWeights);
    const setDragging = useWorkspacePanelsStore((state) => state.setDragging);

    const isHorizontal = side === 'top' || side === 'bottom';
    const verticalSide: VerticalDockSide | null = side === 'left' || side === 'right' ? side : null;
    const dockRef = useRef<HTMLDivElement>(null);
    const suppressTabClickRef = useRef(false);
    const dragRef = useRef<null | {
        id: WorkspacePanelId;
        startX: number;
        startY: number;
        lastX: number;
        lastY: number;
        moved: boolean;
    }>(null);
    const [dragPoint, setDragPoint] = useState<null | { x: number; y: number }>(null);
    const [dropTarget, setDropTarget] = useState<null | DropTarget>(null);
    const resizeRef = useRef<null | { startX: number; startY: number; startSize: number }>(null);
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);

    const dockSections = useMemo(
        () =>
            sections[side]
                .map((section, index) => ({
                    index,
                    active: section.active,
                    tabs: section.tabs.filter((id) => !hidden[id]),
                }))
                .filter((section) => section.tabs.length > 0),
        [sections, side, hidden]
    );
    const hasVisiblePanel = dockSections.some((section) => section.active != null);
    const sectionWeight = useMemo(
        () => normalizeSectionWeights(verticalSide ? sectionWeights[verticalSide] : undefined, dockSections.length),
        [sectionWeights, verticalSide, dockSections.length]
    );

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const composed = typeof event.composedPath === 'function' ? event.composedPath() : [];
            const preserveSelection = (composed as EventTarget[]).some(
                (node) => node instanceof HTMLElement && node.dataset?.preserveSelection === 'true'
            );
            if (preserveSelection) return;
            const clickedInsideDock =
                event.target instanceof Element && event.target.closest('[data-dock-side]') !== null;
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
        resizeRef.current = { startX: e.clientX, startY: e.clientY, startSize: size };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };
    const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = resizeRef.current;
        if (!state) return;
        if (side === 'top' || side === 'bottom') {
            const delta = (e.clientY - state.startY) * (side === 'bottom' ? -1 : 1);
            setHeight(side, clamp(state.startSize + delta, MIN_HEIGHT, MAX_HEIGHT));
            return;
        }
        const delta = (e.clientX - state.startX) * (side === 'right' ? -1 : 1);
        setWidth(side, clamp(state.startSize + delta, MIN_WIDTH, MAX_WIDTH));
    };
    const handleResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!resizeRef.current) return;
        resizeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
    };

    const sectionResizeRef = useRef<null | { boundary: number; startY: number; height: number; weights: number[] }>(
        null
    );

    const handleSectionResizeDown = (boundary: number) => (e: React.PointerEvent<HTMLDivElement>) => {
        const height = dockRef.current?.getBoundingClientRect().height ?? 0;
        if (!verticalSide || height <= 0) return;
        sectionResizeRef.current = { boundary, startY: e.clientY, height, weights: sectionWeight };
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {}
        e.preventDefault();
    };
    const handleSectionResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const resize = sectionResizeRef.current;
        if (!resize || !verticalSide) return;
        const total = resize.weights.reduce((sum, weight) => sum + weight, 0);
        if (!(total > 0)) return;
        const perPixel = total / resize.height;
        const delta = (e.clientY - resize.startY) * perPixel;
        setSectionWeights(
            verticalSide,
            dragSectionWeight(resize.weights, resize.boundary, delta, MIN_SECTION_HEIGHT * perPixel)
        );
    };
    const handleSectionResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!sectionResizeRef.current) return;
        sectionResizeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
    };

    const dockRegionRect = useCallback((target: DockSide): DockRect => {
        const el = dockElement(target);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { left: r.left, top: r.top, width: r.width, height: r.height };
        }
        const state = useWorkspacePanelsStore.getState();
        const center = centerColumnRect();
        const vw = window.innerWidth;
        if (target === 'top' || target === 'bottom') {
            const height = state.heights[target];
            const left = center?.left ?? 0;
            const width = center?.width ?? vw;
            const top = center?.top ?? MENUBAR_HEIGHT;
            const full = center?.height ?? window.innerHeight - MENUBAR_HEIGHT;
            return target === 'top' ? { left, top, width, height } : { left, top: top + full - height, width, height };
        }
        const own = dockRef.current?.getBoundingClientRect();
        const top = center?.top ?? (own && own.height > 0 ? own.top : MENUBAR_HEIGHT);
        const height = center?.height ?? (own && own.height > 0 ? own.height : window.innerHeight - MENUBAR_HEIGHT);
        const preferred = state.widths[target];
        const width = clamp(preferred || Math.round(vw * 0.25), MIN_WIDTH, MAX_WIDTH);
        return target === 'left' ? { left: 0, top, width, height } : { left: vw - width, top, width, height };
    }, []);

    const nearestDockSide = useCallback(
        (x: number, y: number): DockSide => {
            const onScreen = DOCK_SIDES.filter((candidate) => dockElement(candidate));
            const pool = onScreen.length > 0 ? onScreen : DOCK_SIDES;
            let best = pool[0];
            let bestDistance = Infinity;
            for (const candidate of pool) {
                const rect = dockRegionRect(candidate);
                const dx = x - (rect.left + rect.width / 2);
                const dy = y - (rect.top + rect.height / 2);
                const distance = dx * dx + dy * dy;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = candidate;
                }
            }
            return best;
        },
        [dockRegionRect]
    );

    const appendTarget = useCallback(
        (target: DockSide, rect: DockRect, zone?: DockZone, zoneRect?: DockRect): DropTarget => {
            const sections = useWorkspacePanelsStore.getState().sections[target];
            const sectionIndex = Math.max(0, sections.length - 1);
            const tabIndex = sections[sectionIndex]?.tabs.length ?? 0;
            return { side: target, sectionIndex, tabIndex, split: false, rect, line: null, zone, zoneRect };
        },
        []
    );

    const dropTargetFor = useCallback(
        (id: WorkspacePanelId, x: number, y: number): DropTarget | null => {
            const state = useWorkspacePanelsStore.getState();
            const from = panelSide(state.sections, id);
            const fromSection = panelSectionIndex(state.sections, from, id);
            const overDock = DOCK_SIDES.find((which) => {
                const el = dockElement(which);
                return el ? isInsideRect(x, y, el.getBoundingClientRect()) : false;
            });
            if (!overDock) {
                const center = centerColumnRect();
                if (center && isInsideRect(x, y, center)) {
                    const zone = resolveDockZone(center, x, y);
                    const target = zone === 'center' ? nearestDockSide(x, y) : zone;
                    return appendTarget(target, dockRegionRect(target), zone, center);
                }
                const empty = DOCK_SIDES.find(
                    (which) => !dockElement(which) && isInsideRect(x, y, dockRegionRect(which))
                );
                return empty ? appendTarget(empty, dockRegionRect(empty)) : null;
            }
            const root = dockElement(overDock)!;
            const dockRect = root.getBoundingClientRect();
            const sectionEls = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-section]'));
            const canSplit = overDock === 'left' || overDock === 'right';

            for (const sectionEl of sectionEls) {
                const strip = sectionEl.querySelector<HTMLElement>('[data-dock-strip]');
                if (!strip) continue;
                const stripRect = strip.getBoundingClientRect();
                if (y < stripRect.top || y > stripRect.bottom) continue;
                const index = Number(sectionEl.dataset.dockSection);
                const sectionTabs = state.sections[overDock][index]?.tabs ?? [];
                const localReorder = overDock === from && index === fromSection;
                const tabEls = Array.from(strip.querySelectorAll<HTMLElement>('[data-panel-id]'));
                for (const el of tabEls) {
                    const r = el.getBoundingClientRect();
                    if (x < r.left + r.width / 2) {
                        return {
                            side: overDock,
                            sectionIndex: index,
                            tabIndex: sectionTabs.indexOf(el.dataset.panelId as WorkspacePanelId),
                            split: false,
                            rect: dockRect,
                            line: localReorder ? null : r.left - dockRect.left,
                        };
                    }
                }
                const tail = tabEls[tabEls.length - 1];
                return {
                    side: overDock,
                    sectionIndex: index,
                    tabIndex: sectionTabs.length,
                    split: false,
                    rect: dockRect,
                    line: localReorder ? null : tail ? tail.getBoundingClientRect().right - dockRect.left : null,
                };
            }

            for (const sectionEl of sectionEls) {
                const r = sectionEl.getBoundingClientRect();
                if (y < r.top || y > r.bottom) continue;
                const index = Number(sectionEl.dataset.dockSection);
                if (!canSplit) {
                    return appendTarget(overDock, {
                        left: dockRect.left,
                        top: dockRect.top,
                        width: dockRect.width,
                        height: dockRect.height,
                    });
                }
                const above = y < r.top + r.height / 2;
                return {
                    side: overDock,
                    sectionIndex: above ? index : index + 1,
                    tabIndex: 0,
                    split: true,
                    rect: {
                        left: r.left,
                        top: above ? r.top : r.top + r.height / 2,
                        width: r.width,
                        height: r.height / 2,
                    },
                    line: null,
                };
            }
            return null;
        },
        [appendTarget, dockRegionRect, nearestDockSide]
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
            setDropTarget(dropTargetFor(session.id, e.clientX, e.clientY));
            setDragPoint({ x: e.clientX, y: e.clientY });
        };

        const finish = () => {
            const session = dragRef.current;
            if (!session) return;
            dragRef.current = null;
            setDragging(null);
            setDragPoint(null);
            setDropTarget(null);
            if (!session.moved) return;
            const target = dropTargetFor(session.id, session.lastX, session.lastY);
            if (!target) return;
            moveTab(session.id, {
                side: target.side,
                sectionIndex: target.sectionIndex,
                tabIndex: target.tabIndex,
                split: target.split,
            });
        };

        const listeners: Array<[string, EventListener]> = [
            ['pointermove', onMove as EventListener],
            ['pointerup', finish],
            ['pointercancel', finish],
        ];
        for (const [type, handler] of listeners) window.addEventListener(type, handler, true);
        return () => {
            for (const [type, handler] of listeners) window.removeEventListener(type, handler, true);
        };
    }, [moveTab, setDragging, dropTargetFor]);

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
            className={`relative shrink-0 bg-neutral-900 border-neutral-800 transition-colors hover:bg-neutral-800 ${
                isHorizontal
                    ? 'dock-horizontal w-full cursor-row-resize border-t border-b'
                    : 'h-full cursor-col-resize border-l border-r'
            }`}
            style={isHorizontal ? { height: RESIZER_THICKNESS } : { width: RESIZER_THICKNESS }}
            onPointerDown={handleResizeDown}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onPointerCancel={handleResizeUp}
            role="separator"
            aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
            aria-label="Resize panels"
        >
            <div
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80 ${
                    isHorizontal ? 'h-[2px] w-16' : 'w-[2px] h-12'
                }`}
            />
        </div>
    );

    const panel = (
        <div
            ref={dockRef}
            data-dock-side={side}
            className={`relative flex min-h-0 shrink-0 flex-col bg-panel border-border ${
                isHorizontal ? 'dock-horizontal w-full' : ''
            }`}
            style={isHorizontal ? { height: size } : { width: size }}
        >
            {dockSections.map((section, position) => (
                <div
                    key={section.index}
                    data-dock-section={section.index}
                    className="flex min-h-0 flex-col"
                    style={{ flexGrow: sectionWeight[position] ?? 1, flexBasis: 0 }}
                >
                    {position > 0 && !isHorizontal ? (
                        <div
                            data-section-resizer={position}
                            className="relative h-1.5 shrink-0 cursor-row-resize border-y border-neutral-800 bg-neutral-900 transition-colors hover:bg-neutral-800"
                            role="separator"
                            aria-orientation="horizontal"
                            aria-label="Resize stacked panels"
                            onPointerDown={handleSectionResizeDown(position - 1)}
                            onPointerMove={handleSectionResizeMove}
                            onPointerUp={handleSectionResizeUp}
                            onPointerCancel={handleSectionResizeUp}
                        >
                            <div className="absolute top-1/2 left-1/2 h-[2px] w-16 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80" />
                        </div>
                    ) : null}
                    <div
                        data-dock-strip={section.index}
                        className="flex items-center gap-1 border-b border-neutral-800 px-1.5 py-1 shrink-0"
                        role="tablist"
                        aria-label="Workspace panels"
                    >
                        {section.tabs.map((id) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                data-panel-id={id}
                                aria-selected={section.active === id}
                                onPointerDown={handleTabPointerDown(id)}
                                onClick={() => {
                                    if (suppressTabClickRef.current) {
                                        suppressTabClickRef.current = false;
                                        return;
                                    }
                                    activate(id);
                                }}
                                className={`cursor-grab touch-none rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                                    section.active === id
                                        ? 'bg-neutral-800 text-white'
                                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
                                } ${dragging === id ? 'cursor-grabbing opacity-50' : ''}`}
                            >
                                {WORKSPACE_PANEL_LABELS[id]}
                            </button>
                        ))}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col">
                        {section.active != null ? panelBody(section.active) : null}
                    </div>
                </div>
            ))}
        </div>
    );

    const showDropZone = dragging != null && panelSide(sections, dragging) === side && dropTarget != null;
    const dropZone = dropTarget ? (
        <div
            data-dock-target={dropTarget.side}
            className="pointer-events-none fixed z-[1090] overflow-hidden"
            style={{
                left: dropTarget.rect.left,
                top: dropTarget.rect.top,
                width: dropTarget.rect.width,
                height: dropTarget.rect.height,
            }}
            aria-hidden
        >
            <div className="absolute inset-0" style={{ backgroundColor: 'rgba(55,148,255,0.20)' }} />
            {dropTarget.line != null ? (
                <div
                    data-drop-line="true"
                    className="absolute top-0 bottom-0"
                    style={{ left: dropTarget.line, width: 3, marginLeft: -1, backgroundColor: DOCK_ACCENT }}
                />
            ) : null}
        </div>
    ) : null;

    const dockGuide =
        dropTarget?.zone && dropTarget.zoneRect ? (
            <DockGuide centerRect={dropTarget.zoneRect} zone={dropTarget.zone} />
        ) : null;

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
            {hasVisiblePanel ? (
                <>
                    {side === 'left' || side === 'top' ? panel : resizer}
                    {side === 'left' || side === 'top' ? resizer : panel}
                </>
            ) : null}
            {showDropZone ? dropZone : null}
            {showDropZone ? dockGuide : null}
            {dragChip}
        </>
    );
};

export default WorkspaceDock;
