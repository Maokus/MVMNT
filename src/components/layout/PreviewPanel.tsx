import React, { useEffect, useRef, useState } from 'react';
import { useVisualizer } from '../context/VisualizerContext';
import { useSceneSelection } from '../context/SceneSelectionContext';
import { pointInPolygon, buildGeometry, localPointFor, computeScaledTransform, computeAnchorAdjustment, computeRotation } from '../../visualizer/math';

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
                        const rect = canvas.getBoundingClientRect();
                        const scaleX = canvas.width / rect.width;
                        const scaleY = canvas.height / rect.height;
                        const x = (e.clientX - rect.left) * scaleX;
                        const y = (e.clientY - rect.top) * scaleY;
                        // If an element is already selected, first test handle hits
                        const selectedId = vis._interactionState?.selectedElementId || null;
                        if (selectedId) {
                            const handles = vis.getSelectionHandlesAtTime?.(selectedId, vis.getCurrentTime?.() ?? 0) || [];
                            // Prioritize anchor handle if overlapping with scale handles
                            let handleHit = null as any;
                            const hitTest = (h: any) => {
                                if (h.shape === 'circle') { const dx = x - h.cx; const dy = y - h.cy; return Math.sqrt(dx * dx + dy * dy) <= h.r + 2; }
                                return x >= h.cx - h.size * 0.5 && x <= h.cx + h.size * 0.5 && y >= h.cy - h.size * 0.5 && y <= h.cy + h.size * 0.5;
                            };
                            const anchorHandle = handles.find((h: any) => h.type === 'anchor');
                            if (anchorHandle && hitTest(anchorHandle)) {
                                handleHit = anchorHandle;
                            } else {
                                handleHit = handles.find((h: any) => hitTest(h));
                            }
                            if (handleHit) {
                                vis.setInteractionState({ activeHandle: handleHit.id, draggingElementId: selectedId });
                                const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                                const rec = boundsList.find((b: any) => b.id === selectedId);
                                const geom = buildGeometry(rec) || {};
                                const bb = rec?.baseBounds || null;
                                const localFor = (tag: string) => localPointFor(tag, bb);
                                const handleType: string = handleHit.type;
                                let fixedWorldPoint: { x: number; y: number } | null = null;
                                let fixedLocalPoint: { x: number; y: number } | null = null;
                                let dragLocalPoint: { x: number; y: number } | null = null;
                                if ((geom as any).corners) {
                                    const c = (geom as any).corners;
                                    const m = (geom as any).mids;
                                    // Determine fixed & drag points based on handle
                                    switch (handleType) {
                                        case 'scale-nw': fixedWorldPoint = c.BR; fixedLocalPoint = localFor('BR'); dragLocalPoint = localFor('TL'); break;
                                        case 'scale-ne': fixedWorldPoint = c.BL; fixedLocalPoint = localFor('BL'); dragLocalPoint = localFor('TR'); break;
                                        case 'scale-se': fixedWorldPoint = c.TL; fixedLocalPoint = localFor('TL'); dragLocalPoint = localFor('BR'); break;
                                        case 'scale-sw': fixedWorldPoint = c.TR; fixedLocalPoint = localFor('TR'); dragLocalPoint = localFor('BL'); break;
                                        case 'scale-n': fixedWorldPoint = m.MBottom; fixedLocalPoint = localFor('MBottom'); dragLocalPoint = localFor('MTop'); break;
                                        case 'scale-s': fixedWorldPoint = m.MTop; fixedLocalPoint = localFor('MTop'); dragLocalPoint = localFor('MBottom'); break;
                                        case 'scale-e': fixedWorldPoint = m.MLeft; fixedLocalPoint = localFor('MLeft'); dragLocalPoint = localFor('MRight'); break;
                                        case 'scale-w': fixedWorldPoint = m.MRight; fixedLocalPoint = localFor('MRight'); dragLocalPoint = localFor('MLeft'); break;
                                        default: break;
                                    }
                                }
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
                        let hit = null;
                        for (let i = boundsList.length - 1; i >= 0; i--) {
                            const b = boundsList[i] as any;
                            if (b.corners && b.corners.length === 4) {
                                if (pointInPolygon(x, y, b.corners)) { hit = b; break; }
                            } else if (x >= b.bounds.x && x <= b.bounds.x + b.bounds.width && y >= b.bounds.y && y <= b.bounds.y + b.bounds.height) { hit = b; break; }
                        }
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
                        const rect = canvas.getBoundingClientRect();
                        const scaleX = canvas.width / rect.width;
                        const scaleY = canvas.height / rect.height;
                        const x = (e.clientX - rect.left) * scaleX;
                        const y = (e.clientY - rect.top) * scaleY;
                        if (vis._interactionState?.draggingElementId && vis._dragMeta) {
                            const meta = vis._dragMeta;
                            const elId = vis._interactionState.draggingElementId;
                            const dx = x - meta.startX;
                            const dy = y - meta.startY;
                            if (meta.mode === 'move') {
                                let moveDx = dx; let moveDy = dy;
                                if (e.shiftKey) {
                                    // Constrain to local X or Y axis (choose dominant projection)
                                    const rotation = meta.origRotation || 0; // radians internally
                                    const cos = Math.cos(rotation);
                                    const sin = Math.sin(rotation);
                                    // Local axes in world space
                                    const axisX = { x: cos, y: sin };
                                    const axisY = { x: -sin, y: cos };
                                    const d = { x: moveDx, y: moveDy };
                                    const projX = d.x * axisX.x + d.y * axisX.y;
                                    const projY = d.x * axisY.x + d.y * axisY.y;
                                    if (Math.abs(projX) > Math.abs(projY)) {
                                        // keep only X component
                                        moveDx = axisX.x * projX;
                                        moveDy = axisX.y * projX;
                                    } else {
                                        moveDx = axisY.x * projY;
                                        moveDy = axisY.y * projY;
                                    }
                                }
                                const newX = meta.origOffsetX + moveDx; const newY = meta.origOffsetY + moveDy;
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
                                const { bounds, baseBounds } = meta;
                                const relXRaw = (x - bounds.x) / (bounds.width || 1);
                                const relYRaw = (y - bounds.y) / (bounds.height || 1);
                                // computeAnchorAdjustment now performs clamping + optional snapping + offset compensation (incl skew)
                                if (baseBounds) {
                                    const { newAnchorX, newAnchorY, newOffsetX, newOffsetY } = computeAnchorAdjustment(
                                        relXRaw,
                                        relYRaw,
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
                            const hitTest = (h: any) => {
                                if (h.shape === 'circle') { const dx2 = x - h.cx; const dy2 = y - h.cy; return Math.sqrt(dx2 * dx2 + dy2 * dy2) <= h.r + 2; }
                                return x >= h.cx - h.size * 0.5 && x <= h.cx + h.size * 0.5 && y >= h.cy - h.size * 0.5 && y <= h.cy + h.size * 0.5;
                            };
                            let handleHover: any = null;
                            const anchorHandle = handles.find((h: any) => h.type === 'anchor');
                            if (anchorHandle && hitTest(anchorHandle)) {
                                handleHover = anchorHandle;
                            } else {
                                handleHover = handles.find((h: any) => hitTest(h));
                            }
                            if (handleHover) {
                                if (vis._interactionState.activeHandle !== handleHover.id) vis.setInteractionState({ activeHandle: handleHover.id });
                                return; // don't change element hover while over a handle
                            } else if (vis._interactionState.activeHandle) {
                                vis.setInteractionState({ activeHandle: null });
                            }
                        }
                        // Hover detection (only when not dragging)
                        const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                        let hoverId = null;
                        for (let i = boundsList.length - 1; i >= 0; i--) {
                            const b = boundsList[i] as any;
                            if (b.corners && b.corners.length === 4) {
                                if (pointInPolygon(x, y, b.corners)) { hoverId = b.id; break; }
                            } else if (x >= b.bounds.x && x <= b.bounds.x + b.bounds.width && y >= b.bounds.y && y <= b.bounds.y + b.bounds.height) { hoverId = b.id; break; }
                        }
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
