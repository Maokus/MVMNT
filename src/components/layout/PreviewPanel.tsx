import React, { useEffect, useRef, useState } from 'react';
import { useVisualizer } from '../context/VisualizerContext';
import { useSceneSelection } from '../context/SceneSelectionContext';
// (Former inline math-related logic moved to canvasInteractionUtils)
import { onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasMouseLeave } from './canvasInteractionUtils';

const PreviewPanel: React.FC = () => {
    const ctx = useVisualizer();
    const { canvasRef, isPlaying, playPause, stop, stepForward, stepBackward, currentTimeLabel, exportSettings, totalDuration, numericCurrentTime, seekPercent } = ctx;
    const { selectElement, sceneBuilder, updateElementConfig, incrementPropertyPanelRefresh } = useSceneSelection();
    const width = exportSettings.width;
    const height = exportSettings.height;
    // totalDuration already includes pre+base+post. We want 0% at -prePadding.
    const prePadding = exportSettings.prePadding || 0;
    const adjustedCurrent = numericCurrentTime + prePadding; // shift so -prePadding -> 0
    const progressPercent = totalDuration ? (adjustedCurrent / totalDuration) : 0;
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
        // Adapt seekPercent: it expects percent of totalDuration (which includes padding). We pass through.
        seekPercent(percent);
    };

    // Thin wrapper handlers delegating to extracted utilities
    const visualizerInstance = (ctx as any).visualizer;
    const handlerDeps = React.useMemo(() => ({
        canvasRef,
        visualizer: visualizerInstance,
        sceneBuilder,
        selectElement,
        updateElementConfig,
        incrementPropertyPanelRefresh
    }), [canvasRef, visualizerInstance, sceneBuilder, selectElement, updateElementConfig, incrementPropertyPanelRefresh]);

    const handleCanvasMouseDown = (e: React.MouseEvent) => onCanvasMouseDown(e, handlerDeps);
    const handleCanvasMouseMove = (e: React.MouseEvent) => onCanvasMouseMove(e, handlerDeps);
    const handleCanvasMouseUp = (e: React.MouseEvent) => onCanvasMouseUp(e, handlerDeps);
    const handleCanvasMouseLeave = (e: React.MouseEvent) => onCanvasMouseLeave(e, handlerDeps);

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
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseLeave}
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
