import React, { useEffect, useRef, useState } from 'react';
import { useVisualizer } from '../context/VisualizerContext';
import { useSceneSelection } from '../context/SceneSelectionContext';

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
                            const handleHit = handles.find((h: any) => {
                                if (h.shape === 'circle') {
                                    const dx = x - h.cx; const dy = y - h.cy; return Math.sqrt(dx * dx + dy * dy) <= h.r + 2;
                                }
                                return x >= h.cx - h.size * 0.5 && x <= h.cx + h.size * 0.5 && y >= h.cy - h.size * 0.5 && y <= h.cy + h.size * 0.5;
                            });
                            if (handleHit) {
                                vis.setInteractionState({ activeHandle: handleHit.id, draggingElementId: selectedId });
                                const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                                const rec = boundsList.find((b: any) => b.id === selectedId);
                                // Precompute geometry for robust screen-space scaling (corner/edge basis vectors, fixed point, etc.)
                                let geom: any = {};
                                if (rec && rec.corners && rec.corners.length === 4) {
                                    const corners = rec.corners; // TL, TR, BR, BL (as produced in visualizer-core)
                                    const TL = corners[0];
                                    const TR = corners[1];
                                    const BR = corners[2];
                                    const BL = corners[3];
                                    const widthVec = { x: TR.x - TL.x, y: TR.y - TL.y }; // local +X axis in world
                                    const heightVec = { x: BL.x - TL.x, y: BL.y - TL.y }; // local +Y axis in world
                                    // Midpoints
                                    const mid = (p: any, q: any) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
                                    const MTop = mid(TL, TR);
                                    const MRight = mid(TR, BR);
                                    const MBottom = mid(BR, BL);
                                    const MLeft = mid(BL, TL);
                                    const baseBounds = rec.baseBounds || null;
                                    geom = {
                                        widthVec,
                                        heightVec,
                                        corners: { TL, TR, BR, BL },
                                        mids: { MTop, MRight, MBottom, MLeft },
                                        baseBounds,
                                    };
                                }
                                // Local coordinate helper (base bounds space)
                                const bb = rec?.baseBounds || null;
                                const localFor = (tag: string) => {
                                    if (!bb) return { x: 0, y: 0 };
                                    const x0 = bb.x; const y0 = bb.y; const w = bb.width; const h = bb.height;
                                    switch (tag) {
                                        case 'TL': return { x: x0, y: y0 };
                                        case 'TR': return { x: x0 + w, y: y0 };
                                        case 'BR': return { x: x0 + w, y: y0 + h };
                                        case 'BL': return { x: x0, y: y0 + h };
                                        case 'MTop': return { x: x0 + w / 2, y: y0 };
                                        case 'MRight': return { x: x0 + w, y: y0 + h / 2 };
                                        case 'MBottom': return { x: x0 + w / 2, y: y0 + h };
                                        case 'MLeft': return { x: x0, y: y0 + h / 2 };
                                        default: return { x: 0, y: 0 };
                                    }
                                };
                                const handleType: string = handleHit.type;
                                let fixedWorldPoint: { x: number; y: number } | null = null;
                                let fixedLocalPoint: { x: number; y: number } | null = null;
                                let dragLocalPoint: { x: number; y: number } | null = null;
                                if (geom.corners) {
                                    const c = geom.corners;
                                    const m = geom.mids;
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
                                (vis._dragMeta = {
                                    mode: handleHit.type,
                                    startX: x,
                                    startY: y,
                                    origOffsetX: rec?.element?.offsetX || 0,
                                    origOffsetY: rec?.element?.offsetY || 0,
                                    origWidth: rec?.bounds?.width || 0,
                                    origHeight: rec?.bounds?.height || 0,
                                    origScaleX: rec?.element?.elementScaleX || rec?.element?.globalScaleX || 1,
                                    origScaleY: rec?.element?.elementScaleY || rec?.element?.globalScaleY || 1,
                                    origRotation: rec?.element?.elementRotation || 0,
                                    origSkewX: rec?.element?.elementSkewX || 0,
                                    origSkewY: rec?.element?.elementSkewY || 0,
                                    origAnchorX: rec?.element?.anchorX || 0.5,
                                    origAnchorY: rec?.element?.anchorY || 0.5,
                                    bounds: rec?.bounds,
                                    corners: rec?.corners || null,
                                    baseBounds: rec?.baseBounds || null,
                                    geom,
                                    fixedWorldPoint,
                                    fixedLocalPoint,
                                    dragLocalPoint,
                                });
                                return;
                            }
                        }
                        // Otherwise do normal element hit test
                        const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                        let hit = null;
                        const pointInPoly = (ptX: number, ptY: number, corners: { x: number; y: number }[]) => {
                            // Ray casting algorithm
                            let inside = false;
                            for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
                                const xi = corners[i].x, yi = corners[i].y;
                                const xj = corners[j].x, yj = corners[j].y;
                                const intersect = ((yi > ptY) !== (yj > ptY)) && (ptX < (xj - xi) * (ptY - yi) / (yj - yi + 1e-9) + xi);
                                if (intersect) inside = !inside;
                            }
                            return inside;
                        };
                        for (let i = boundsList.length - 1; i >= 0; i--) {
                            const b = boundsList[i] as any;
                            if (b.corners && b.corners.length === 4) {
                                if (pointInPoly(x, y, b.corners)) { hit = b; break; }
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
                                // Advanced screen-space scaling: dragged handle follows mouse, opposite stays fixed
                                const { geom, mode, origScaleX, origScaleY, baseBounds, fixedWorldPoint, fixedLocalPoint, dragLocalPoint } = meta;
                                if (!geom || !fixedWorldPoint || !fixedLocalPoint || !dragLocalPoint || !baseBounds) {
                                    return; // fallback if geometry missing
                                }
                                const TL = geom.corners?.TL;
                                if (!TL) return;
                                const widthVec = geom.widthVec; // world vector for +X local axis
                                const heightVec = geom.heightVec; // world vector for +Y local axis
                                const wvx = widthVec.x; const wvy = widthVec.y;
                                const hvx = heightVec.x; const hvy = heightVec.y;
                                const det = wvx * hvy - wvy * hvx;
                                // Dragged point world target
                                const dragWorld = { x, y };
                                // Vector from fixed world point to dragged world target
                                const dWorld = { x: dragWorld.x - fixedWorldPoint.x, y: dragWorld.y - fixedWorldPoint.y };
                                let newScaleX = origScaleX;
                                let newScaleY = origScaleY;
                                if (Math.abs(det) > 1e-6) {
                                    if (mode === 'scale-se' || mode === 'scale-ne' || mode === 'scale-sw' || mode === 'scale-nw') {
                                        // Corner: solve 2x2 for coefficients along width & height axes
                                        // For chosen corner pair we assume fixed at opposite; basis vectors from fixed corner orientation
                                        // We need basis from fixed corner; width/height vectors may originate at TL; adjust if fixed not TL.
                                        // Build basis from fixed corner world orientation: derive which corner fixed is to map correct vectors
                                        // Simpler: Recompute basis relative to fixed corner by selecting appropriate corner orientation mapping.
                                        // We'll map corners to consistent orientation TL(TR) etc and rotate arrays until fixed == TL.
                                        const cornersOrdered = [geom.corners.TL, geom.corners.TR, geom.corners.BR, geom.corners.BL];
                                        const cornerNames = ['TL', 'TR', 'BR', 'BL'];
                                        let idxFixed = cornerNames.findIndex(n => {
                                            const cw = (geom.corners as any)[n];
                                            return cw === fixedWorldPoint; // object identity check
                                        });
                                        if (idxFixed === -1) {
                                            // fallback using distance
                                            let bestI = 0; let bestD = Infinity;
                                            cornersOrdered.forEach((c, i) => { const dxF = c.x - fixedWorldPoint.x; const dyF = c.y - fixedWorldPoint.y; const dist = dxF * dxF + dyF * dyF; if (dist < bestD) { bestD = dist; bestI = i; } });
                                            idxFixed = bestI;
                                        }
                                        // Rotate arrays so fixed becomes new TL (index 0)
                                        const rot = (arr: any[], k: number) => arr.slice(k).concat(arr.slice(0, k));
                                        const rc = rot(cornersOrdered, idxFixed);
                                        const basisW = { x: rc[1].x - rc[0].x, y: rc[1].y - rc[0].y };
                                        const basisH = { x: rc[3].x - rc[0].x, y: rc[3].y - rc[0].y };
                                        const det2 = basisW.x * basisH.y - basisW.y * basisH.x;
                                        if (Math.abs(det2) > 1e-6) {
                                            const a = (dWorld.x * basisH.y - dWorld.y * basisH.x) / det2;
                                            const b = (basisW.x * dWorld.y - basisW.y * dWorld.x) / det2;
                                            // Some orientations (NE, SW) result in width/height axes swapped; correct for those cases
                                            let aAdj = a;
                                            let bAdj = b;
                                            if (mode === 'scale-ne' || mode === 'scale-sw') {
                                                // Swap axes to match intuitive horizontal/vertical mapping
                                                const tmp = aAdj; aAdj = bAdj; bAdj = tmp;
                                            }
                                            // Ensure positive scaling factors (avoid flipping / negative leading to min clamp)
                                            aAdj = Math.abs(aAdj);
                                            bAdj = Math.abs(bAdj);
                                            newScaleX = Math.max(0.01, origScaleX * aAdj);
                                            newScaleY = Math.max(0.01, origScaleY * bAdj);
                                        }
                                    } else {
                                        // Edge scaling: project along single axis
                                        if (mode === 'scale-e' || mode === 'scale-w') {
                                            const len2 = wvx * wvx + wvy * wvy || 1;
                                            let a = (dWorld.x * wvx + dWorld.y * wvy) / len2; // width factor change
                                            if (mode === 'scale-w') a = -a; // invert for left edge so dragging left increases size
                                            a = Math.abs(a); // keep positive
                                            newScaleX = Math.max(0.01, origScaleX * a);
                                        } else if (mode === 'scale-n' || mode === 'scale-s') {
                                            const len2 = hvx * hvx + hvy * hvy || 1;
                                            let b = (dWorld.x * hvx + dWorld.y * hvy) / len2; // height factor change
                                            if (mode === 'scale-n') b = -b; // invert for top edge
                                            b = Math.abs(b);
                                            newScaleY = Math.max(0.01, origScaleY * b);
                                        }
                                    }
                                }
                                // Uniform scaling with Shift (apply dominant axis scale factor to both)
                                if (e.shiftKey) {
                                    const ratioX = newScaleX / (origScaleX || 1);
                                    const ratioY = newScaleY / (origScaleY || 1);
                                    // Determine which axis user intended (larger deviation from 1)
                                    let factor = Math.abs(ratioX - 1) > Math.abs(ratioY - 1) ? ratioX : ratioY;
                                    if (!isFinite(factor) || factor <= 0) factor = 1;
                                    newScaleX = Math.max(0.01, (origScaleX || 1) * factor);
                                    newScaleY = Math.max(0.01, (origScaleY || 1) * factor);
                                }
                                // Compute new offset to keep fixed point stationary
                                // offset = fixedWorld - R*S*K*(fixedLocal - anchorLocal)
                                const rotation = meta.origRotation || 0; // already radians
                                const skewX = meta.origSkewX || 0;
                                const skewY = meta.origSkewY || 0;
                                const anchorLocal = {
                                    x: baseBounds.x + baseBounds.width * meta.origAnchorX,
                                    y: baseBounds.y + baseBounds.height * meta.origAnchorY,
                                };
                                const applyRSK = (vx: number, vy: number) => {
                                    // K
                                    const kx = Math.tan(skewX);
                                    const ky = Math.tan(skewY);
                                    const kxVy = vx + kx * vy;
                                    const kyVx = ky * vx + vy;
                                    // Scale
                                    const sx = kxVy * newScaleX;
                                    const sy = kyVx * newScaleY;
                                    // Rotate
                                    const cos = Math.cos(rotation);
                                    const sin = Math.sin(rotation);
                                    return { x: cos * sx - sin * sy, y: sin * sx + cos * sy };
                                };
                                const relFixed = { x: fixedLocalPoint.x - anchorLocal.x, y: fixedLocalPoint.y - anchorLocal.y };
                                const qFixed = applyRSK(relFixed.x, relFixed.y);
                                const newOffsetX = fixedWorldPoint.x - qFixed.x;
                                const newOffsetY = fixedWorldPoint.y - qFixed.y;
                                sceneBuilder?.updateElementConfig?.(elId, { elementScaleX: newScaleX, elementScaleY: newScaleY, offsetX: newOffsetX, offsetY: newOffsetY });
                                updateElementConfig?.(elId, { elementScaleX: newScaleX, elementScaleY: newScaleY, offsetX: newOffsetX, offsetY: newOffsetY });
                            } else if (meta.mode === 'anchor' && meta.bounds) {
                                const { bounds, baseBounds } = meta;
                                const relXRaw = (x - bounds.x) / (bounds.width || 1);
                                const relYRaw = (y - bounds.y) / (bounds.height || 1);
                                let anchorX = Math.max(0, Math.min(1, relXRaw));
                                let anchorY = Math.max(0, Math.min(1, relYRaw));
                                if (e.shiftKey) {
                                    // Snap to 9-point grid
                                    const candidates = [0, 0.5, 1];
                                    let bestAX = anchorX, bestAY = anchorY;
                                    let bestD = Infinity;
                                    for (const ax of candidates) {
                                        for (const ay of candidates) {
                                            const dxC = ax - anchorX; const dyC = ay - anchorY;
                                            const d2 = dxC * dxC + dyC * dyC;
                                            if (d2 < bestD) { bestD = d2; bestAX = ax; bestAY = ay; }
                                        }
                                    }
                                    anchorX = bestAX; anchorY = bestAY;
                                }
                                // Adjust offset so visual position stays the same
                                if (baseBounds) {
                                    const oldAnchorLocal = {
                                        x: baseBounds.x + baseBounds.width * meta.origAnchorX,
                                        y: baseBounds.y + baseBounds.height * meta.origAnchorY,
                                    };
                                    const newAnchorLocal = {
                                        x: baseBounds.x + baseBounds.width * anchorX,
                                        y: baseBounds.y + baseBounds.height * anchorY,
                                    };
                                    const deltaLocal = { x: newAnchorLocal.x - oldAnchorLocal.x, y: newAnchorLocal.y - oldAnchorLocal.y };
                                    const rotation = (meta.origRotation || 0); // already stored in radians
                                    const skewX = meta.origSkewX || 0;
                                    const skewY = meta.origSkewY || 0;
                                    const scaleX = meta.origScaleX || 1;
                                    const scaleY = meta.origScaleY || 1;
                                    const applyRSK = (vx: number, vy: number) => {
                                        const kx = Math.tan(skewX);
                                        const ky = Math.tan(skewY);
                                        const kxVy = vx + kx * vy;
                                        const kyVx = ky * vx + vy;
                                        const sx = kxVy * scaleX;
                                        const sy = kyVx * scaleY;
                                        const cos = Math.cos(rotation);
                                        const sin = Math.sin(rotation);
                                        return { x: cos * sx - sin * sy, y: sin * sx + cos * sy };
                                    };
                                    const adjust = applyRSK(deltaLocal.x, deltaLocal.y); // RSK(new-old)
                                    const newOffsetX = meta.origOffsetX + adjust.x;
                                    const newOffsetY = meta.origOffsetY + adjust.y;
                                    sceneBuilder?.updateElementConfig?.(elId, { anchorX, anchorY, offsetX: newOffsetX, offsetY: newOffsetY });
                                    updateElementConfig?.(elId, { anchorX, anchorY, offsetX: newOffsetX, offsetY: newOffsetY });
                                } else {
                                    sceneBuilder?.updateElementConfig?.(elId, { anchorX, anchorY });
                                    updateElementConfig?.(elId, { anchorX, anchorY });
                                }
                            } else if (meta.mode === 'rotate' && meta.bounds) {
                                let centerX = meta.bounds.x + meta.bounds.width * meta.origAnchorX;
                                let centerY = meta.bounds.y + meta.bounds.height * meta.origAnchorY;
                                // If we have oriented corners, compute pivot via bilinear interpolation for correct anchor under rotation/skew
                                if (meta.corners && meta.corners.length === 4) {
                                    const interp = (a: number, b: number, t: number) => a + (b - a) * t;
                                    const top = {
                                        x: interp(meta.corners[0].x, meta.corners[1].x, meta.origAnchorX),
                                        y: interp(meta.corners[0].y, meta.corners[1].y, meta.origAnchorX),
                                    };
                                    const bottom = {
                                        x: interp(meta.corners[3].x, meta.corners[2].x, meta.origAnchorX),
                                        y: interp(meta.corners[3].y, meta.corners[2].y, meta.origAnchorX),
                                    };
                                    const anchorPt = {
                                        x: interp(top.x, bottom.x, meta.origAnchorY),
                                        y: interp(top.y, bottom.y, meta.origAnchorY),
                                    };
                                    centerX = anchorPt.x;
                                    centerY = anchorPt.y;
                                }
                                // Calculate initial angle at drag start
                                const startAngleRad = Math.atan2(meta.startY - centerY, meta.startX - centerX);
                                const currentAngleRad = Math.atan2(y - centerY, x - centerX);
                                const deltaRad = currentAngleRad - startAngleRad;
                                // meta.origRotation stored in radians, deltaRad already radians
                                let newRotationRad = (meta.origRotation || 0) + deltaRad;
                                if (e.shiftKey) {
                                    const deg = newRotationRad * 180 / Math.PI;
                                    const snappedDeg = Math.round(deg / 15) * 15;
                                    newRotationRad = snappedDeg * Math.PI / 180;
                                }
                                // Provide degrees to updateElementConfig (system converts degrees -> radians internally)
                                const newRotationDeg = newRotationRad * 180 / Math.PI;
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
                            const handleHover = handles.find((h: any) => {
                                if (h.shape === 'circle') { const dx2 = x - h.cx; const dy2 = y - h.cy; return Math.sqrt(dx2 * dx2 + dy2 * dy2) <= h.r + 2; }
                                return x >= h.cx - h.size * 0.5 && x <= h.cx + h.size * 0.5 && y >= h.cy - h.size * 0.5 && y <= h.cy + h.size * 0.5;
                            });
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
                                let inside = false; // reuse same alg
                                let corners = b.corners;
                                for (let m = 0, n = corners.length - 1; m < corners.length; n = m++) {
                                    const xi = corners[m].x, yi = corners[m].y;
                                    const xj = corners[n].x, yj = corners[n].y;
                                    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
                                    if (intersect) inside = !inside;
                                }
                                if (inside) { hoverId = b.id; break; }
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
