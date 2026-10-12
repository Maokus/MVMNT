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
    const { selectElement, selectNode, updateElementConfig, incrementPropertyPanelRefresh, addElement } =
        useSceneSelection();
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
    zoomRef.current = zoom;
    panRef.current = pan;

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

    const resetViewTransform = useCallback(() => {
        setZoom(1);
        zoomRef.current = 1;
        setPan({ x: 0, y: 0 });
        panRef.current = { x: 0, y: 0 };
        visualizerInstance?.invalidateRender?.();
    }, [visualizerInstance]);

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

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !interactive) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
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

            zoomRef.current = nextZoom;
            panRef.current = { x: nextPanX, y: nextPanY };
            setZoom(nextZoom);
            setPan({ x: nextPanX, y: nextPanY });
            visualizerInstance?.invalidateRender?.();
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, [interactive, visualizerInstance]);

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

            const overlay = overlayCanvasRef.current;
            if (overlay && el) {
                const dpr = window.devicePixelRatio || 1;
                const targetW = Math.round(el.clientWidth * dpr);
                const targetH = Math.round(el.clientHeight * dpr);
                if (overlay.width !== targetW || overlay.height !== targetH) {
                    overlay.width = targetW;
                    overlay.height = targetH;
                    visualizerInstance?.invalidateRender?.();
                }
            }
        };
        compute();
        const ro = new ResizeObserver(() => compute());
        ro.observe(el);
        window.addEventListener('resize', compute);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', compute);
        };
    }, [width, height, visualizerInstance]);

    useEffect(() => {
        if (!visualizerInstance?.setOverlayCanvas) return;
        const overlay = overlayCanvasRef.current;
        if (overlay && containerRef.current) {
            const dpr = window.devicePixelRatio || 1;
            overlay.width = Math.round(containerRef.current.clientWidth * dpr);
            overlay.height = Math.round(containerRef.current.clientHeight * dpr);
        }
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

    // mouse3
    const handleMiddleMouseMoveWindow = useCallback(
        (event: MouseEvent) => {
            if (!isMiddlePanningRef.current) return;
            const dx = event.clientX - panStartRef.current.clientX;
            const dy = event.clientY - panStartRef.current.clientY;
            const nextPan = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
            panRef.current = nextPan;
            setPan(nextPan);
            visualizerInstance?.invalidateRender?.();
        },
        [visualizerInstance]
    );

    const handleMiddleMouseUpWindow = useCallback(
        (event: MouseEvent) => {
            if (event.button === 1 || (event.buttons & 4) === 0) {
                isMiddlePanningRef.current = false;
                setIsPanning(false);
                if (visualizerInstance?.canvas?.style) visualizerInstance.canvas.style.cursor = '';
                if (visualizerInstance?.overlayCanvas?.style) visualizerInstance.overlayCanvas.style.cursor = '';
                if (containerRef.current?.style) containerRef.current.style.cursor = '';
                window.removeEventListener('mousemove', handleMiddleMouseMoveWindow);
                window.removeEventListener('mouseup', handleMiddleMouseUpWindow);
            }
        },
        [handleMiddleMouseMoveWindow, visualizerInstance]
    );

    useEffect(() => {
        return () => {
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
            handleUnselect();
            return;
        }
        if (e.button === 1) {
            e.preventDefault();
            const now = performance.now();
            if (now - lastMiddleClickTimeRef.current < 300) {
                resetViewTransform();
                lastMiddleClickTimeRef.current = -Infinity;
                return;
            }
            lastMiddleClickTimeRef.current = now;
            isMiddlePanningRef.current = true;
            setIsPanning(true);
            if (visualizerInstance?.canvas?.style) visualizerInstance.canvas.style.cursor = 'grabbing';
            if (visualizerInstance?.overlayCanvas?.style) visualizerInstance.overlayCanvas.style.cursor = 'grabbing';
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
            onContextMenu={interactive ? handleContextMenu : undefined}
            onPointerDownCapture={() => activateCommandSurface('preview')}
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
                    onContextMenu={interactive ? handleContextMenu : undefined}
                    onDragOver={interactive ? handleDragOver : undefined}
                    onDrop={interactive ? handleDrop : undefined}
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
