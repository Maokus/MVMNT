import React, { useEffect, useRef, useState } from 'react';
import { useVisualizer } from '../context/VisualizerContext';
import { useSceneSelection } from '../context/SceneSelectionContext';
import { computeScaledTransform, computeAnchorAdjustment, computeRotation, getCanvasWorldPoint, findHandleUnderPoint, computeScaleHandleReferencePoints, computeConstrainedMoveDelta, elementHitTest, elementHoverId } from '../../visualizer/math';

const PreviewPanel: React.FC = () => {
    const ctx = useVisualizer();
    const { canvasRef, isPlaying, playPause, stop, stepForward, stepBackward, currentTimeLabel, exportSettings, totalDuration, numericCurrentTime, seekPercent } = ctx;
    const { selectElement, sceneBuilder, updateElementConfig, incrementPropertyPanelRefresh } = useSceneSelection();
    const width = exportSettings.width;
    const height = exportSettings.height;
    const progressPercent = totalDuration ? (numericCurrentTime / totalDuration) : 0;
    // Sizing state for display (CSS) size of canvas maintaining aspect ratio
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: width, h: height });

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
            setDisplaySize(prev => (prev.w === next.w && prev.h === next.h ? prev : next));
        };
        compute();
        const ro = new ResizeObserver(() => compute());
        ro.observe(el);
        window.addEventListener('resize', compute);
        return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
    }, [width, height]);

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!seekPercent) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        seekPercent(percent);
    };
    return (
        <div className="preview-panel">
            <div className="canvas-container" ref={containerRef}>
                <canvas
                    id='canvas'
                    ref={canvasRef}
                    width={width}
                    height={height}
                    style={{
                        // Maintain aspect ratio and fit: intrinsic buffer size (width/height attrs) sets resolution, below sets on-screen size
                        width: `${displaySize.w}px`,
                        height: `${displaySize.h}px`,
                        maxWidth: '100%',
                        maxHeight: '100%'
                    }}
                    onMouseDown={(e) => {
                        const canvas = canvasRef.current;
                        if (!canvas) return;
                        const vis = (ctx as any).visualizer;
                        if (!vis) return;
                        const { x, y } = getCanvasWorldPoint(canvas, e.clientX, e.clientY);
                        // If an element is already selected, first test handle hits
                        const selectedId = vis._interactionState?.selectedElementId || null;
                        if (selectedId) {
                            const handles = vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
                            const handleHit = findHandleUnderPoint(handles, x, y) as any;
                            if (handleHit) {
                                vis.setInteractionState({ activeHandle: handleHit.id, draggingElementId: selectedId });
                                const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                                const rec = boundsList.find((b: any) => b.id === selectedId);
                                const { geom, fixedWorldPoint, fixedLocalPoint, dragLocalPoint } = computeScaleHandleReferencePoints(handleHit.type, rec);
                                const el = rec?.element
                                const dragMeta: any = {
                                    mode: handleHit.type,
                                    startX: x,
                                    startY: y,
                                    origOffsetX: el?.getProperty("offsetX") ?? 0,
                                    origOffsetY: el?.getProperty("offsetY") ?? 0,
                                    origWidth: rec?.bounds?.width ?? 0,
                                    origHeight: rec?.bounds?.height ?? 0,
                                    origScaleX: el?.getProperty("elementScaleX") ?? el?.getProperty("globalScaleX") ?? 1,
                                    origScaleY: el?.getProperty("elementScaleY") ?? el?.getProperty("globalScaleY") ?? 1,
                                    origRotation: el?.getProperty("elementRotation") ?? 0,
                                    origSkewX: el?.getProperty("elementSkewX") ?? 0,
                                    origSkewY: el?.getProperty("elementSkewY") ?? 0,
                                    origAnchorX: el?.getProperty("anchorX") ?? 0.5,
                                    origAnchorY: el?.getProperty("anchorY") ?? 0.5,
                                    bounds: rec?.bounds,
                                    corners: rec?.corners || null,
                                    baseBounds: rec?.baseBounds || null,
                                    geom,
                                    fixedWorldPoint,
                                    fixedLocalPoint,
                                    dragLocalPoint,
                                };
                                (vis._dragMeta = dragMeta);
                                return;
                            }
                        }
                        // Otherwise do normal element hit test
                        const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                        const hit = elementHitTest(boundsList, x, y);
                        if (hit) {
                            selectElement(hit.id);
                            vis.setInteractionState({ draggingElementId: hit.id, activeHandle: 'move' });
                            (vis._dragMeta = {
                                mode: 'move',
                                startX: x,
                                startY: y,
                                origOffsetX: hit.element?.offsetX || 0,
                                origOffsetY: hit.element?.offsetY || 0,
                                // store rotation/skew for shift-axis constraint
                                origRotation: hit.element?.elementRotation || 0,
                                origSkewX: hit.element?.elementSkewX || 0,
                                origSkewY: hit.element?.elementSkewY || 0
                            });
                        } else { selectElement(null); vis.setInteractionState({ hoverElementId: null, draggingElementId: null, activeHandle: null }); }
                    }}
                    onMouseMove={(e) => {
                        const canvas = canvasRef.current;
                        if (!canvas) return;
                        const vis = (ctx as any).visualizer;
                        if (!vis) return;
                        const { x, y } = getCanvasWorldPoint(canvas, e.clientX, e.clientY);
                        if (vis._interactionState?.draggingElementId && vis._dragMeta) {
                            const meta = vis._dragMeta;
                            const elId = vis._interactionState.draggingElementId;
                            const dx = x - meta.startX;
                            const dy = y - meta.startY;
                            if (meta.mode === 'move') {
                                const constrained = computeConstrainedMoveDelta(dx, dy, meta.origRotation || 0, e.shiftKey);
                                const newX = meta.origOffsetX + constrained.dx; const newY = meta.origOffsetY + constrained.dy;
                                sceneBuilder?.updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
                                updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
                            } else if (meta.mode?.startsWith('scale') && meta.bounds) {
                                const r = computeScaledTransform(x, y, {
                                    mode: meta.mode,
                                    origScaleX: meta.origScaleX,
                                    origScaleY: meta.origScaleY,
                                    baseBounds: meta.baseBounds,
                                    fixedWorldPoint: meta.fixedWorldPoint,
                                    fixedLocalPoint: meta.fixedLocalPoint,
                                    dragLocalPoint: meta.dragLocalPoint,
                                    geom: meta.geom,
                                    origRotation: meta.origRotation,
                                    origSkewX: meta.origSkewX,
                                    origSkewY: meta.origSkewY,
                                    origAnchorX: meta.origAnchorX,
                                    origAnchorY: meta.origAnchorY,
                                }, e.shiftKey);
                                if (r) {
                                    sceneBuilder?.updateElementConfig?.(elId, { elementScaleX: r.newScaleX, elementScaleY: r.newScaleY, offsetX: r.newOffsetX, offsetY: r.newOffsetY });
                                    updateElementConfig?.(elId, { elementScaleX: r.newScaleX, elementScaleY: r.newScaleY, offsetX: r.newOffsetX, offsetY: r.newOffsetY });
                                }
                            } else if (meta.mode === 'anchor' && meta.bounds) {
                                const { baseBounds } = meta;
                                if (baseBounds) {
                                    const { newAnchorX, newAnchorY, newOffsetX, newOffsetY } = computeAnchorAdjustment(
                                        x,
                                        y,
                                        {
                                            baseBounds,
                                            origAnchorX: meta.origAnchorX,
                                            origAnchorY: meta.origAnchorY,
                                            origOffsetX: meta.origOffsetX,
                                            origOffsetY: meta.origOffsetY,
                                            origRotation: meta.origRotation,
                                            origSkewX: meta.origSkewX,
                                            origSkewY: meta.origSkewY,
                                            origScaleX: meta.origScaleX,
                                            origScaleY: meta.origScaleY,
                                        },
                                        e.shiftKey
                                    );
                                    sceneBuilder?.updateElementConfig?.(elId, { anchorX: newAnchorX, anchorY: newAnchorY, offsetX: newOffsetX, offsetY: newOffsetY });
                                    updateElementConfig?.(elId, { anchorX: newAnchorX, anchorY: newAnchorY, offsetX: newOffsetX, offsetY: newOffsetY });
                                }
                            } else if (meta.mode === 'rotate' && meta.bounds) {
                                const newRotationDeg = computeRotation(x, y, meta, e.shiftKey);
                                sceneBuilder?.updateElementConfig?.(elId, { elementRotation: newRotationDeg });
                                updateElementConfig?.(elId, { elementRotation: newRotationDeg });
                            }
                            vis.setInteractionState({}); // trigger
                            return;
                        }
                        // Hover update including handles when selected
                        const selectedId = vis._interactionState?.selectedElementId || null;
                        if (selectedId) {
                            const handles = vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
                            const handleHover = findHandleUnderPoint(handles, x, y) as any;
                            if (handleHover) {
                                if (vis._interactionState.activeHandle !== handleHover.id) vis.setInteractionState({ activeHandle: handleHover.id });
                                return; // don't change element hover while over a handle
                            } else if (vis._interactionState.activeHandle) {
                                vis.setInteractionState({ activeHandle: null });
                            }
                        }
                        const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                        const hoverId = elementHoverId(boundsList, x, y);
                        if (hoverId !== vis._interactionState?.hoverElementId) vis.setInteractionState({ hoverElementId: hoverId });
                    }}
                    onMouseUp={(e) => {
                        const vis = (ctx as any).visualizer;
                        if (!vis) return;
                        if (vis._interactionState?.draggingElementId) {
                            vis.setInteractionState({ draggingElementId: null, activeHandle: null });
                            vis._dragMeta = null;
                            // Force a one-time refresh of the properties panel so offsetX/offsetY fields show final drag result
                            incrementPropertyPanelRefresh();
                        }
                    }}
                    onMouseLeave={() => {
                        const vis = (ctx as any).visualizer;
                        if (!vis) return;
                        if (vis._interactionState?.draggingElementId) {
                            vis.setInteractionState({ draggingElementId: null, activeHandle: null });
                            vis._dragMeta = null;
                            incrementPropertyPanelRefresh();
                        }
                        vis.setInteractionState({ hoverElementId: null, activeHandle: null });
                    }}
                ></canvas>
            </div>

            <div className="playback-controls">
                <button className="btn btn-secondary" onClick={stepBackward}>⏪</button>
                <button className="btn btn-primary" onClick={playPause}>
                    {isPlaying ? '⏸️' : '▶️'}
                </button>
                <button className="btn btn-secondary" onClick={stepForward}>⏩</button>
                <button className="btn btn-secondary" onClick={stop}>⏹️</button>
                <span className="time-display">{currentTimeLabel}</span>
                <div className="progress-bar-container" onClick={handleProgressClick}>
                    <div className="progress-bar-fill" style={{ width: `${Math.max(0, Math.min(100, progressPercent * 100))}%` }}></div>
                </div>
            </div>
        </div>
    );
};

export default PreviewPanel;
