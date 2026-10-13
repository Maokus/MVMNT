import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useVisualizer } from '@context/VisualizerContext';
import { useSceneSelection } from '@context/SceneSelectionContext';
// (Former inline math-related logic moved to canvasInteractionUtils)
import { onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasMouseLeave } from './canvasInteractionUtils';
import { useTimelineStore } from '@state/timelineStore';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { DRAG_ASSET_TYPE } from '../asset-manager/AssetManagerPanel';
import { CreateElementPopup } from '@workspace/panels/scene-element';
import { isTextEditingTarget, useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { activateCommandSurface, isCommandSurfaceActive } from '@context/commands/commandContext';
import type { SceneSimulationReadiness } from '@state/scene/runtimeAdapter';
import { SIMULATION_PENDING_NOTICE_GRACE_MS } from '@core/scene/runtime/simulation-runner';
import { framePreviewBounds, unionPreviewBounds, type PreviewBounds } from './previewFraming';

interface PreviewPanelProps {
    interactive?: boolean;
}

const READY_SIMULATION: SceneSimulationReadiness = Object.freeze({ status: 'ready', affected: Object.freeze([]) });

function simulationStatusText(readiness: SceneSimulationReadiness): string {
    const count = readiness.affected.length;
    const title =
        readiness.status === 'error'
            ? 'Simulation unavailable'
            : readiness.status === 'pending'
              ? 'Simulation waiting for inputs'
              : 'Preparing simulation';
    const affected = count > 1 ? `${count} elements · ` : '';
    const retained =
        readiness.status !== 'error' && readiness.affected.some((element) => element.hasRenderableFrame)
            ? ' · Showing previously completed artwork'
            : '';
    return `${affected}${title}${readiness.reason ? ` — ${readiness.reason}` : ''}${retained}`;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ interactive = true }) => {
    const ctx = useVisualizer();
    const { canvasRef, exportSettings } = ctx;
    const view = useTimelineStore((s) => s.timelineView);
    const {
        selectElement,
        selectNode,
        selectedNodeIds,
        updateElementConfig,
        incrementPropertyPanelRefresh,
        addElement,
    } = useSceneSelection();
    const width = exportSettings.width;
    const height = exportSettings.height;
    // Sizing state for display (CSS) size of canvas maintaining aspect ratio
    const containerRef = useRef<HTMLDivElement | null>(null);

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: width, h: height });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const zoomRef = useRef(1);
    const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    // rAF handle for coalescing per-pixel pan updates into one React state sync.
    const panRafRef = useRef<number | null>(null);

    const isMiddlePanningRef = useRef(false);
    const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number }>({
        clientX: 0,
        clientY: 0,
        panX: 0,
        panY: 0,
    });
    const lastMiddleClickTimeRef = useRef<number>(-Infinity);

    const [createElementPopupPosition, setCreateElementPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const pointerPositionRef = useRef({ x: 0, y: 0 });

    const visualizerInstance = (ctx as any).visualizer;
    const setPreviewCursor = useCallback(
        (cursor: string) => {
            const vis = visualizerInstance as any;
            if (vis?.canvas?.style) vis.canvas.style.cursor = cursor;
            if (vis?.canvas?.parentElement?.style) vis.canvas.parentElement.style.cursor = cursor;
            if (vis?.overlayCanvas?.style) vis.overlayCanvas.style.cursor = cursor;
        },
        [visualizerInstance]
    );

    const applyViewTransform = useCallback(
        (nextZoom: number, nextPan: { x: number; y: number }) => {
            if (panRafRef.current !== null) {
                cancelAnimationFrame(panRafRef.current);
                panRafRef.current = null;
            }
            zoomRef.current = nextZoom;
            panRef.current = nextPan;
            const canvas = canvasRef.current;
            if (canvas) canvas.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${nextZoom})`;
            setZoom(nextZoom);
            setPan(nextPan);
            visualizerInstance?.invalidateRender?.();
        },
        [canvasRef, visualizerInstance]
    );

    const resetViewTransform = useCallback(() => {
        applyViewTransform(1, { x: 0, y: 0 });
    }, [applyViewTransform]);

    const frameBounds = useCallback(
        (bounds: PreviewBounds | null) => {
            const container = containerRef.current;
            if (!bounds || !container) return;
            const next = framePreviewBounds(bounds, { width, height }, displaySize, {
                width: container.clientWidth,
                height: container.clientHeight,
            });
            if (next) applyViewTransform(next.zoom, next.pan);
        },
        [applyViewTransform, displaySize, width, height]
    );

    const fitAllContent = useCallback(() => {
        const time = visualizerInstance?.getCurrentTime?.() ?? 0;
        const artwork = visualizerInstance?.getElementBoundsAtTime?.(time) ?? [];
        frameBounds(
            unionPreviewBounds([
                { x: 0, y: 0, width, height },
                ...artwork
                    .filter((record: { effectiveVisible?: boolean }) => record.effectiveVisible !== false)
                    .map((record: { bounds: PreviewBounds }) => record.bounds),
            ])
        );
    }, [visualizerInstance, frameBounds, width, height]);

    const fitSelectedContent = useCallback(() => {
        if (!selectedNodeIds.length) return;
        const time = visualizerInstance?.getCurrentTime?.() ?? 0;
        frameBounds(visualizerInstance?.getNodeSelectionAtTime?.(selectedNodeIds, time)?.bounds ?? null);
    }, [selectedNodeIds, visualizerInstance, frameBounds]);

    const updatePan = useCallback(
        (nextPan: { x: number; y: number }) => {
            panRef.current = nextPan;
            const canvas = canvasRef.current;
            if (canvas) {
                canvas.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${zoomRef.current})`;
            }
            if (panRafRef.current === null) {
                panRafRef.current = requestAnimationFrame(() => {
                    panRafRef.current = null;
                    setPan({ ...panRef.current });
                    visualizerInstance?.invalidateRender?.();
                });
            }
        },
        [canvasRef, visualizerInstance]
    );

    const handleUnselect = useCallback(() => {
        selectElement(null);
        visualizerInstance?.setInteractionState?.({
            selectedElementId: null,
            selectedNodeIds: [],
            draggingElementId: null,
            activeHandle: null,
            snapGuides: [],
            marqueeBounds: null,
        });
        visualizerInstance?.invalidateRender?.();
    }, [selectElement, visualizerInstance]);

    useGlobalShortcut({
        id: 'scene.add-element-menu',
        domain: 'focused-control',
        enabled: interactive,
        matches: (event) =>
            isCommandSurfaceActive('preview', event) &&
            event.shiftKey &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            event.key.toLowerCase() === 'a' &&
            !isTextEditingTarget(event.target),
        handle: (event) => {
            event.preventDefault();
            setCreateElementPopupPosition({ ...pointerPositionRef.current });
            return true;
        },
    });

    useGlobalShortcut({
        id: 'preview.reset-zoom',
        domain: 'focused-control',
        enabled: interactive,
        matches: (event) =>
            isCommandSurfaceActive('preview', event) &&
            (event.ctrlKey || event.metaKey) &&
            !event.shiftKey &&
            !event.altKey &&
            (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') &&
            !isTextEditingTarget(event.target),
        handle: (event) => {
            event.preventDefault();
            resetViewTransform();
            return true;
        },
    });

    useGlobalShortcut({
        id: 'preview.fit-content',
        domain: 'focused-control',
        enabled: interactive,
        matches: (event) =>
            isCommandSurfaceActive('preview', event) &&
            event.shiftKey &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !isTextEditingTarget(event.target) &&
            (event.code === 'Digit1' || event.code === 'Digit2'),
        handle: (event) => {
            event.preventDefault();
            if (event.code === 'Digit1') fitAllContent();
            else fitSelectedContent();
            return true;
        },
    });

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !interactive) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) {
                if (!e.deltaX && !e.deltaY) return;
                e.preventDefault();
                const unit =
                    e.deltaMode === WheelEvent.DOM_DELTA_LINE
                        ? 16
                        : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
                          ? el.clientHeight
                          : 1;
                updatePan({
                    x: panRef.current.x - e.deltaX * unit,
                    y: panRef.current.y - e.deltaY * unit,
                });
                return;
            }
            e.preventDefault();

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const mx = e.clientX - (rect.left + rect.width / 2);
            const my = e.clientY - (rect.top + rect.height / 2);

            const currentZoom = zoomRef.current;
            const currentPan = panRef.current;

            const factor = Math.exp(-e.deltaY * 0.002);
            const nextZoom = Math.min(10, Math.max(0.05, currentZoom * factor));

            const nextPanX = mx - (mx - currentPan.x) * (nextZoom / currentZoom);
            const nextPanY = my - (my - currentPan.y) * (nextZoom / currentZoom);

            applyViewTransform(nextZoom, { x: nextPanX, y: nextPanY });
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, [interactive, applyViewTransform, updatePan]);

    const syncOverlaySize = useCallback(() => {
        const overlay = overlayCanvasRef.current;
        const el = containerRef.current;
        if (!overlay || !el) return;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(el.clientWidth * dpr);
        const targetH = Math.round(el.clientHeight * dpr);
        if (overlay.width !== targetW || overlay.height !== targetH) {
            overlay.width = targetW;
            overlay.height = targetH;
            visualizerInstance?.invalidateRender?.();
        }
    }, [visualizerInstance]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !width || !height) return;
        const PADDING_X = 40; // canvas-container horizontal padding total (20px left + 20px right)
        const PADDING_Y = 40; // vertical padding
        const aspect = width / height;
        const compute = () => {
            const availW = Math.max(0, el.clientWidth - PADDING_X);
            const availH = Math.max(0, el.clientHeight - PADDING_Y);
            if (availW <= 0 || availH <= 0) return;
            // Determine whether width or height is the constraining dimension
            let drawW: number;
            let drawH: number;
            if (availW / availH > aspect) {
                // container is proportionally wider than needed -> height constrained
                drawH = availH;
                drawW = Math.min(availW, drawH * aspect);
            } else {
                // width constrained
                drawW = availW;
                drawH = Math.min(availH, drawW / aspect);
            }
            // Avoid needless state updates (round to integer pixels for crispness)
            const next = { w: Math.floor(drawW), h: Math.floor(drawH) };
            setDisplaySize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
            syncOverlaySize();
        };
        compute();
        const ro = new ResizeObserver(() => compute());
        ro.observe(el);
        window.addEventListener('resize', compute);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', compute);
        };
    }, [width, height, syncOverlaySize]);

    useEffect(() => {
        if (!visualizerInstance?.setOverlayCanvas) return;

        syncOverlaySize();
        const overlay = overlayCanvasRef.current;
        visualizerInstance.setOverlayCanvas(overlay);
        return () => {
            visualizerInstance.setOverlayCanvas?.(null);
        };
    }, [visualizerInstance]);

    const simulationReadiness = useSyncExternalStore(
        useCallback(
            (listener: () => void) => visualizerInstance?.subscribeSimulationStatus?.(listener) ?? (() => {}),
            [visualizerInstance]
        ),
        useCallback(() => visualizerInstance?.getSimulationReadiness?.() ?? READY_SIMULATION, [visualizerInstance])
    );
    const [visibleSimulationReadiness, setVisibleSimulationReadiness] = useState<SceneSimulationReadiness | null>(null);
    const unavailableSince = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (simulationReadiness.status === 'ready') {
            unavailableSince.current = undefined;
            setVisibleSimulationReadiness(null);
            return;
        }
        unavailableSince.current ??= Date.now();
        const remaining = SIMULATION_PENDING_NOTICE_GRACE_MS - (Date.now() - unavailableSince.current);
        if (simulationReadiness.status === 'error' || remaining <= 0) {
            setVisibleSimulationReadiness(simulationReadiness);
            return;
        }
        const timer = window.setTimeout(() => setVisibleSimulationReadiness(simulationReadiness), remaining);
        return () => window.clearTimeout(timer);
    }, [simulationReadiness]);
    const handlerDeps = useMemo(
        () => ({
            canvasRef,
            visualizer: visualizerInstance,
            selectElement,
            selectNode,
            updateElementConfig,
            incrementPropertyPanelRefresh,
        }),
        [canvasRef, visualizerInstance, selectElement, selectNode, updateElementConfig, incrementPropertyPanelRefresh]
    );

    const depsRef = useRef(handlerDeps);
    depsRef.current = handlerDeps;

    const draggingRef = useRef(false);

    const handleCanvasMouseMoveWindow = useCallback((event: MouseEvent) => {
        if (!draggingRef.current) return;
        onCanvasMouseMove(event, depsRef.current);
    }, []);

    const handleCanvasMouseUpWindow = useCallback(
        (event: MouseEvent) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            onCanvasMouseUp(event, depsRef.current);
            window.removeEventListener('mousemove', handleCanvasMouseMoveWindow);
            window.removeEventListener('mouseup', handleCanvasMouseUpWindow);
        },
        [handleCanvasMouseMoveWindow]
    );

    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', handleCanvasMouseMoveWindow);
            window.removeEventListener('mouseup', handleCanvasMouseUpWindow);
        };
    }, [handleCanvasMouseMoveWindow, handleCanvasMouseUpWindow]);

    // Middle-pan: paint each pixel synchronously via direct style write, but sync
    // React state at most once per frame. Pan feel stays 1:1 while renders drop
    // from per-event to per-frame.
    const handleMiddleMouseMoveWindow = useCallback(
        (event: MouseEvent) => {
            if (!isMiddlePanningRef.current) return;
            const dx = event.clientX - panStartRef.current.clientX;
            const dy = event.clientY - panStartRef.current.clientY;
            const nextPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
            updatePan(nextPan);
        },
        [updatePan]
    );

    const handleMiddleMouseUpWindow = useCallback(
        (event: MouseEvent) => {
            if (event.button === 1 || (event.buttons & 4) === 0) {
                isMiddlePanningRef.current = false;
                setIsPanning(false);
                // Flush the latest pan synchronously so state never lags the gesture.
                if (panRafRef.current !== null) {
                    cancelAnimationFrame(panRafRef.current);
                    panRafRef.current = null;
                }
                setPan({ ...panRef.current });
                visualizerInstance?.invalidateRender?.();
                setPreviewCursor('default');
                if (containerRef.current?.style) containerRef.current.style.cursor = '';
                window.removeEventListener('mousemove', handleMiddleMouseMoveWindow);
                window.removeEventListener('mouseup', handleMiddleMouseUpWindow);
            }
        },
        [handleMiddleMouseMoveWindow, setPreviewCursor, visualizerInstance]
    );

    useEffect(() => {
        return () => {
            if (panRafRef.current !== null) {
                cancelAnimationFrame(panRafRef.current);
                panRafRef.current = null;
            }
            window.removeEventListener('mousemove', handleMiddleMouseMoveWindow);
            window.removeEventListener('mouseup', handleMiddleMouseUpWindow);
        };
    }, [handleMiddleMouseMoveWindow, handleMiddleMouseUpWindow]);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        handleUnselect();
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.button === 2) {
            e.preventDefault();
            return;
        }
        if (e.button === 1) {
            e.preventDefault();
            if (draggingRef.current) return; // left-drag already active; don't start pan underneath
            const now = performance.now();
            if (now - lastMiddleClickTimeRef.current < 300) {
                resetViewTransform();
                lastMiddleClickTimeRef.current = -Infinity;
                return;
            }
            lastMiddleClickTimeRef.current = now;
            isMiddlePanningRef.current = true;
            setIsPanning(true);

            setPreviewCursor('grabbing');
            if (containerRef.current?.style) containerRef.current.style.cursor = 'grabbing';
            panStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                panX: panRef.current.x,
                panY: panRef.current.y,
            };
            window.addEventListener('mousemove', handleMiddleMouseMoveWindow);
            window.addEventListener('mouseup', handleMiddleMouseUpWindow);
            return;
        }
        if (e.button !== 0) return;
        if (isMiddlePanningRef.current) return; // middle-pan active; don't start element drag underneath
        e.preventDefault();
        draggingRef.current = true;
        window.addEventListener('mousemove', handleCanvasMouseMoveWindow);
        window.addEventListener('mouseup', handleCanvasMouseUpWindow);
        onCanvasMouseDown(e, handlerDeps);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (isMiddlePanningRef.current) return;
        onCanvasMouseMove(e, handlerDeps);
    };
    const handleCanvasMouseUp = (e: React.MouseEvent) => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', handleCanvasMouseMoveWindow);
        window.removeEventListener('mouseup', handleCanvasMouseUpWindow);
        onCanvasMouseUp(e, handlerDeps);
    };
    const handleCanvasMouseLeave = (e: React.MouseEvent) => onCanvasMouseLeave(e, handlerDeps);

    const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
        if (e.dataTransfer.types.includes(DRAG_ASSET_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLElement>) => {
        const assetId = e.dataTransfer.getData(DRAG_ASSET_TYPE);
        if (!assetId) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const offsetX = Math.round(relX * scaleX);
        const offsetY = Math.round(relY * scaleY);

        const asset = useVisualAssetRegistryStore.getState().assets[assetId];
        if (asset?.file) {
            const isObjectUrl = typeof asset.file !== 'string';
            const url = isObjectUrl ? URL.createObjectURL(asset.file as File) : (asset.file as string);
            const img = new Image();
            img.onload = () => {
                if (isObjectUrl) URL.revokeObjectURL(url);
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    addElement('image', {
                        imageSource: assetId,
                        offsetX,
                        offsetY,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                    });
                } else {
                    addElement('image', { imageSource: assetId, offsetX, offsetY });
                }
            };
            img.onerror = () => {
                if (isObjectUrl) URL.revokeObjectURL(url);
                addElement('image', { imageSource: assetId, offsetX, offsetY });
            };
            img.src = url;
        } else {
            addElement('image', { imageSource: assetId, offsetX, offsetY });
        }
    };

    return (
        <div
            className="preview-panel"
            data-command-surface="preview"
            tabIndex={interactive ? 0 : undefined}
            onPointerDownCapture={(event) => {
                activateCommandSurface('preview');
                if (interactive && !isTextEditingTarget(event.target)) event.currentTarget.focus();
            }}
            onFocusCapture={() => activateCommandSurface('preview')}
            onPointerEnter={(event) => {
                pointerPositionRef.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
                pointerPositionRef.current = { x: event.clientX, y: event.clientY };
            }}
        >
            <div
                className="canvas-container relative select-none"
                ref={containerRef}
                data-preview-container="true"
                style={{ cursor: isPanning ? 'grabbing' : undefined }}
                onContextMenu={interactive ? handleContextMenu : undefined}
                onMouseDown={
                    interactive
                        ? (e) => {
                              if (e.target !== canvasRef.current) handleCanvasMouseDown(e);
                          }
                        : undefined
                }
                onMouseMove={
                    interactive
                        ? (e) => {
                              if (e.target !== canvasRef.current) handleCanvasMouseMove(e);
                          }
                        : undefined
                }
                onMouseUp={
                    interactive
                        ? (e) => {
                              if (e.target !== canvasRef.current) handleCanvasMouseUp(e);
                          }
                        : undefined
                }
                onMouseLeave={interactive ? handleCanvasMouseLeave : undefined}
                onDragOver={interactive ? handleDragOver : undefined}
                onDrop={interactive ? handleDrop : undefined}
            >
                {visibleSimulationReadiness && (
                    <div
                        role="status"
                        className="pointer-events-none absolute top-2 left-2 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white select-none"
                    >
                        {simulationStatusText(visibleSimulationReadiness)}
                    </div>
                )}
                <canvas
                    id="canvas"
                    ref={canvasRef}
                    width={width}
                    height={height}
                    style={{
                        // Maintain aspect ratio and fit: intrinsic buffer size (width/height attrs) sets resolution, below sets on-screen size
                        width: `${displaySize.w}px`,
                        height: `${displaySize.h}px`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        pointerEvents: interactive ? 'auto' : 'none',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        cursor: isPanning ? 'grabbing' : undefined,
                    }}
                    onMouseDown={interactive ? handleCanvasMouseDown : undefined}
                    onMouseMove={interactive ? handleCanvasMouseMove : undefined}
                    onMouseUp={interactive ? handleCanvasMouseUp : undefined}
                    onDragOver={interactive ? handleDragOver : undefined}
                ></canvas>
                <canvas
                    ref={overlayCanvasRef}
                    style={{ cursor: isPanning ? 'grabbing' : undefined }}
                    className="interaction-overlay-canvas pointer-events-none absolute inset-0 w-full h-full"
                ></canvas>
            </div>

            {createElementPopupPosition && (
                <CreateElementPopup
                    position={createElementPopupPosition}
                    onAddElement={addElement}
                    onClose={() => setCreateElementPopupPosition(null)}
                />
            )}

            {/* Playback controls removed; use Timeline panel controls instead */}
        </div>
    );
};

export default PreviewPanel;
