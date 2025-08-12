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
                                    origAnchorX: rec?.element?.anchorX || 0.5,
                                    origAnchorY: rec?.element?.anchorY || 0.5,
                                    bounds: rec?.bounds,
                                });
                                return;
                            }
                        }
                        // Otherwise do normal element hit test
                        const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                        let hit = null;
                        for (let i = boundsList.length - 1; i >= 0; i--) {
                            const b = boundsList[i];
                            if (x >= b.bounds.x && x <= b.bounds.x + b.bounds.width && y >= b.bounds.y && y <= b.bounds.y + b.bounds.height) { hit = b; break; }
                        }
                        if (hit) {
                            selectElement(hit.id);
                            vis.setInteractionState({ draggingElementId: hit.id, activeHandle: 'move' });
                            (vis._dragMeta = { mode: 'move', startX: x, startY: y, origOffsetX: hit.element?.offsetX || 0, origOffsetY: hit.element?.offsetY || 0 });
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
                                const newX = meta.origOffsetX + dx; const newY = meta.origOffsetY + dy;
                                sceneBuilder?.updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
                                updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
                            } else if (meta.mode?.startsWith('scale') && meta.bounds) {
                                // Basic proportional scaling based on which handle
                                const { origWidth, origHeight, origScaleX, origScaleY } = meta;
                                let scaleXFactor = origScaleX;
                                let scaleYFactor = origScaleY;
                                if (origWidth > 0) {
                                    if (meta.mode.includes('e')) scaleXFactor = origScaleX * (1 + dx / origWidth);
                                    if (meta.mode.includes('w')) scaleXFactor = origScaleX * (1 - dx / origWidth);
                                    if (meta.mode === 'scale-n' || meta.mode === 'scale-s') scaleXFactor = origScaleX; // no horizontal change
                                }
                                if (origHeight > 0) {
                                    if (meta.mode.includes('s')) scaleYFactor = origScaleY * (1 + dy / origHeight);
                                    if (meta.mode.includes('n')) scaleYFactor = origScaleY * (1 - dy / origHeight);
                                    if (meta.mode === 'scale-e' || meta.mode === 'scale-w') scaleYFactor = origScaleY; // no vertical change
                                }
                                // Clamp minimal scale
                                scaleXFactor = Math.max(0.01, scaleXFactor);
                                scaleYFactor = Math.max(0.01, scaleYFactor);
                                sceneBuilder?.updateElementConfig?.(elId, { elementScaleX: scaleXFactor, elementScaleY: scaleYFactor });
                                updateElementConfig?.(elId, { elementScaleX: scaleXFactor, elementScaleY: scaleYFactor });
                            } else if (meta.mode === 'anchor' && meta.bounds) {
                                const { bounds } = meta;
                                const relX = (x - bounds.x) / (bounds.width || 1);
                                const relY = (y - bounds.y) / (bounds.height || 1);
                                const anchorX = Math.max(0, Math.min(1, relX));
                                const anchorY = Math.max(0, Math.min(1, relY));
                                sceneBuilder?.updateElementConfig?.(elId, { anchorX, anchorY });
                                updateElementConfig?.(elId, { anchorX, anchorY });
                            } else if (meta.mode === 'rotate' && meta.bounds) {
                                const centerX = meta.bounds.x + meta.bounds.width * meta.origAnchorX;
                                const centerY = meta.bounds.y + meta.bounds.height * meta.origAnchorY;
                                const angleRad = Math.atan2(y - centerY, x - centerX); // radians
                                const angleDeg = angleRad * (180 / Math.PI);
                                sceneBuilder?.updateElementConfig?.(elId, { elementRotation: angleDeg }); // supply degrees (conversion done in element)
                                updateElementConfig?.(elId, { elementRotation: angleDeg });
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
                            const b = boundsList[i];
                            if (x >= b.bounds.x && x <= b.bounds.x + b.bounds.width && y >= b.bounds.y && y <= b.bounds.y + b.bounds.height) {
                                hoverId = b.id;
                                break;
                            }
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
