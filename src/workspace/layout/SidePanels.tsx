import React, { useEffect, useState, useRef } from 'react';
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
import { PropertiesPanel } from '@workspace/panels/properties';
import { CacheDiagnosticsPanel } from '@workspace/panels/properties/CacheDiagnosticsPanel';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useVisualizer } from '@context/VisualizerContext';

interface SidePanelsProps {}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const RESIZER_THICKNESS = 6;
const VERTICAL_MIN_TOP = 160;
const VERTICAL_MIN_BOTTOM = 220;
const HORIZONTAL_MIN_LEFT = 260;
const HORIZONTAL_MIN_RIGHT = 280;

const getLayoutFromWidth = (width: number) => (width >= 768 && width < 1280 ? 'horizontal' : 'vertical');

// Internal component that uses the context
const SidePanelsInternal: React.FC = () => {
    const { exportSettings, debugSettings, exportSequence, exportStatus, visualizer, setExportSettings, setDebugSettings, canvasRef } = useVisualizer() as any;
    const canExport = !!(visualizer && visualizer.getCurrentDuration && visualizer.getCurrentDuration() > 0);
    const [showAddElementDropdown, setShowAddElementDropdown] = useState(false);
    const sidePanelsRef = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState<'vertical' | 'horizontal'>(() => {
        if (typeof window === 'undefined') return 'vertical';
        return getLayoutFromWidth(window.innerWidth);
    });
    const [verticalSize, setVerticalSize] = useState(260);
    const [horizontalSize, setHorizontalSize] = useState(360);
    const [containerRect, setContainerRect] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const resizeStateRef = useRef<null | { orientation: 'vertical' | 'horizontal'; startCoord: number; startSize: number }>(null);

    useEffect(() => {
        const updateLayout = () => {
            if (typeof window === 'undefined') return;
            setLayout(getLayoutFromWidth(window.innerWidth));
        };
        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    useEffect(() => {
        const node = sidePanelsRef.current;
        if (!node || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                setContainerRect({ width, height });
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!sidePanelsRef.current) return;
        const availableHeight = Math.max(1, containerRect.height - RESIZER_THICKNESS);
        const availableWidth = Math.max(1, containerRect.width - RESIZER_THICKNESS);
        if (layout === 'vertical') {
            const maxPrimary = Math.max(VERTICAL_MIN_TOP, availableHeight - VERTICAL_MIN_BOTTOM);
            setVerticalSize((prev) => clamp(prev, VERTICAL_MIN_TOP, maxPrimary));
        } else {
            const maxPrimary = Math.max(HORIZONTAL_MIN_LEFT, availableWidth - HORIZONTAL_MIN_RIGHT);
            setHorizontalSize((prev) => clamp(prev, HORIZONTAL_MIN_LEFT, maxPrimary));
        }
    }, [containerRect.height, containerRect.width, layout]);

    const availableHeight = Math.max(1, containerRect.height - RESIZER_THICKNESS);
    const availableWidth = Math.max(1, containerRect.width - RESIZER_THICKNESS);
    const effectiveVertical = clamp(verticalSize, VERTICAL_MIN_TOP, Math.max(VERTICAL_MIN_TOP, availableHeight - VERTICAL_MIN_BOTTOM));
    const effectiveHorizontal = clamp(horizontalSize, HORIZONTAL_MIN_LEFT, Math.max(HORIZONTAL_MIN_LEFT, availableWidth - HORIZONTAL_MIN_RIGHT));
    const primarySize = layout === 'vertical' ? effectiveVertical : effectiveHorizontal;

    const gridStyle: React.CSSProperties = layout === 'vertical'
        ? {
            display: 'grid',
            gridTemplateRows: `${Math.round(primarySize)}px ${RESIZER_THICKNESS}px 1fr`,
            gridTemplateColumns: '1fr',
            height: '100%',
        }
        : {
            display: 'grid',
            gridTemplateColumns: `${Math.round(primarySize)}px ${RESIZER_THICKNESS}px 1fr`,
            gridTemplateRows: '1fr',
            height: '100%',
        };

    const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!sidePanelsRef.current) return;
        const orientation = layout;
        resizeStateRef.current = {
            orientation,
            startCoord: orientation === 'vertical' ? e.clientY : e.clientX,
            startSize: primarySize,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const state = resizeStateRef.current;
        if (!state || !sidePanelsRef.current) return;
        const rect = sidePanelsRef.current.getBoundingClientRect();
        if (state.orientation === 'vertical') {
            const available = Math.max(1, rect.height - RESIZER_THICKNESS);
            const maxPrimary = Math.max(VERTICAL_MIN_TOP, available - VERTICAL_MIN_BOTTOM);
            const delta = e.clientY - state.startCoord;
            const next = clamp(state.startSize + delta, VERTICAL_MIN_TOP, maxPrimary);
            setVerticalSize(next);
        } else {
            const available = Math.max(1, rect.width - RESIZER_THICKNESS);
            const maxPrimary = Math.max(HORIZONTAL_MIN_LEFT, available - HORIZONTAL_MIN_RIGHT);
            const delta = e.clientX - state.startCoord;
            const next = clamp(state.startSize + delta, HORIZONTAL_MIN_LEFT, maxPrimary);
            setHorizontalSize(next);
        }
    };

    const handleDividerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!resizeStateRef.current) return;
        resizeStateRef.current = null;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
    };

    // Use the scene selection context
    const {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        propertyPanelRefresh,
        clearSelection,
        updateElementConfig,
        addElement,
        deleteElement
    } = useSceneSelection();

    // Debug settings now handled in GlobalPropertiesPanel

    // Handle clicks outside of side panels to clear selection and show global settings
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const composed = typeof event.composedPath === 'function' ? event.composedPath() : [];
            const preserveSelection = (composed as EventTarget[]).some(
                (node) => node instanceof HTMLElement && node.dataset?.preserveSelection === 'true',
            );
            if (preserveSelection) {
                return;
            }
            // Clear selection only if click is outside BOTH side panels and the canvas
            const clickedInsideSidePanels = sidePanelsRef.current?.contains(event.target as Node);
            const canvasEl: HTMLCanvasElement | null = canvasRef?.current || document.getElementById('canvas') as HTMLCanvasElement | null;
            const clickedInsideCanvas = !!(canvasEl && canvasEl.contains(event.target as Node));
            if (!clickedInsideSidePanels && !clickedInsideCanvas) {
                if (selectedElementId) {
                    console.log('Clicked outside side panels and canvas, clearing selection');
                    clearSelection();
                }
            }
        };

        const handleKeyPress = (event: KeyboardEvent) => {
            // Avoid interfering with typing inside inputs/textareas
            const target = event.target as HTMLElement | null;
            const isEditable = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            // Clear selection on Escape key
            if (event.key === 'Escape' && selectedElementId) {
                console.log('Escape key pressed, clearing selection');
                clearSelection();
                return;
            }
            // Delete selected element on Delete key
            if (!isEditable && selectedElementId && (event.key === 'Delete' || event.key === 'Backspace')) {
                deleteElement(selectedElementId);
            }
        };

        // Add event listeners to document
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyPress);

        // Cleanup event listeners on unmount
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [selectedElementId, clearSelection, deleteElement, canvasRef]);

    // Wrapper to handle adding element and closing dropdown
    const handleAddElementAndCloseDropdown = (elementType: string) => {
        addElement(elementType);
        setShowAddElementDropdown(false);
    };

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
    const { getReferenceProps: getAddElementReferenceProps, getFloatingProps: getAddElementFloatingProps } = useInteractions([
        addElementDismiss,
        addElementRole,
    ]);

    return (
        <div
            className="relative flex-1 min-h-0 min-w-[320px]"
            ref={sidePanelsRef}
            style={gridStyle}
        >
            {/* Layer Panel */}
            <div
                className="flex flex-col min-h-0 bg-panel border-border"
                style={layout === 'vertical' ? { gridRow: '1 / 2', gridColumn: '1 / 2' } : { gridRow: '1 / 2', gridColumn: '1 / 2' }}
            >
                <div className="border-b px-4 py-2 shrink-0 flex justify-between items-center relative bg-menubar border-border">
                    <h3 className="text-[13px] font-semibold text-neutral-300 m-0">📚 Elements</h3>
                    <div className="relative">
                        <button
                            {...getAddElementReferenceProps({
                                type: 'button',
                                onClick: () => setShowAddElementDropdown((prev) => !prev),
                                title: 'Add element',
                            })}
                            ref={addElementRefs.setReference}
                            className="px-2 py-1 border rounded cursor-pointer text-[12px] font-medium transition inline-flex items-center justify-center bg-[#0e639c] border-[#1177bb] text-white hover:bg-[#1177bb] hover:border-[#1890d4] ml-auto"
                        >
                            + Add
                        </button>

                        {showAddElementDropdown && (
                            <FloatingPortal>
                                <FloatingFocusManager context={addElementContext} modal={false} initialFocus={-1}>
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
                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    <SceneElementPanel />
                </div>
            </div>

            {/* Divider */}
            <div
                className={`relative bg-neutral-900/70 border-neutral-800 transition-colors duration-150 ${layout === 'vertical' ? 'w-full h-full cursor-row-resize border-t border-b hover:bg-sky-500/30' : 'h-full w-full cursor-col-resize border-l border-r hover:bg-sky-500/30'}`}
                style={layout === 'vertical' ? { gridRow: '2 / 3', gridColumn: '1 / 2' } : { gridRow: '1 / 2', gridColumn: '2 / 3' }}
                onPointerDown={handleDividerPointerDown}
                onPointerMove={handleDividerPointerMove}
                onPointerUp={handleDividerPointerUp}
                onPointerCancel={handleDividerPointerUp}
                role="separator"
                aria-orientation={layout === 'vertical' ? 'horizontal' : 'vertical'}
                aria-label="Resize panels"
            >
                <div
                    className={`${layout === 'vertical'
                        ? 'absolute left-1/2 top-1/2 h-[2px] w-12 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80'
                        : 'absolute left-1/2 top-1/2 w-[2px] h-12 -translate-x-1/2 -translate-y-1/2 rounded bg-neutral-500/80'}`}
                />
            </div>

            {/* Properties Panel */}
            <div
                className="flex flex-col min-h-0 bg-panel border-border"
                style={layout === 'vertical' ? { gridRow: '3 / 4', gridColumn: '1 / 2' } : { gridRow: '1 / 2', gridColumn: '3 / 4' }}
            >
                <div className="border-b px-4 py-2 shrink-0 flex justify-between items-center relative bg-menubar border-border">
                    <h3 id="propertiesHeader" className="text-[13px] font-semibold text-neutral-300 m-0">⚙️ Properties</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                    <CacheDiagnosticsPanel />
                </div>
            </div>
        </div>
    );
};

// Main component (provider now lives higher in tree)
const SidePanels: React.FC<SidePanelsProps> = () => {
    return <SidePanelsInternal />;
};

export default SidePanels;
