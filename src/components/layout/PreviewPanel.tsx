import React, { useEffect, useRef, useState } from 'react';
import { useVisualizer } from '../context/VisualizerContext';
import { useSceneSelection } from '../context/SceneSelectionContext';

const PreviewPanel: React.FC = () => {
    const ctx = useVisualizer();
    const { canvasRef, isPlaying, playPause, stop, stepForward, stepBackward, currentTimeLabel, exportSettings, totalDuration, numericCurrentTime, seekPercent } = ctx;
    const { selectElement, sceneBuilder, updateElementConfig } = useSceneSelection();
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
                        const boundsList = vis.getElementBoundsAtTime(vis.getCurrentTime?.() ?? 0);
                        // Top-most hit: iterate from end (highest z) since list sorted ascending
                        let hit = null;
                        for (let i = boundsList.length - 1; i >= 0; i--) {
                            const b = boundsList[i];
                            if (x >= b.bounds.x && x <= b.bounds.x + b.bounds.width && y >= b.bounds.y && y <= b.bounds.y + b.bounds.height) {
                                hit = b;
                                break;
                            }
                        }
                        if (hit) {
                            // Update global selection (will sync to visualizer via context effect)
                            selectElement(hit.id);
                            // Set dragging state only (selection handled by context)
                            vis.setInteractionState({ draggingElementId: hit.id });
                            // Store drag start metadata
                            (vis._dragMeta = {
                                startX: x,
                                startY: y,
                                origOffsetX: hit.element?.offsetX || 0,
                                origOffsetY: hit.element?.offsetY || 0,
                            });
                        } else {
                            // Clear selection
                            selectElement(null);
                            vis.setInteractionState({ hoverElementId: null, draggingElementId: null });
                        }
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
                            const elId = vis._interactionState.draggingElementId;
                            const dx = x - vis._dragMeta.startX;
                            const dy = y - vis._dragMeta.startY;
                            const newX = vis._dragMeta.origOffsetX + dx;
                            const newY = vis._dragMeta.origOffsetY + dy;
                            if (sceneBuilder && elId) {
                                // Update element config live
                                sceneBuilder.updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
                                updateElementConfig?.(elId, { offsetX: newX, offsetY: newY });
                                vis.setInteractionState({}); // trigger rerender
                            }
                            return;
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
                            vis.setInteractionState({ draggingElementId: null });
                            vis._dragMeta = null;
                        }
                    }}
                    onMouseLeave={() => {
                        const vis = (ctx as any).visualizer;
                        if (!vis) return;
                        if (vis._interactionState?.draggingElementId) {
                            vis.setInteractionState({ draggingElementId: null });
                            vis._dragMeta = null;
                        }
                        vis.setInteractionState({ hoverElementId: null });
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
