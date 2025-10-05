import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVisualizer } from '@context/VisualizerContext';
import { useSceneSelection } from '@context/SceneSelectionContext';
// (Former inline math-related logic moved to canvasInteractionUtils)
import { onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp, onCanvasMouseLeave } from './canvasInteractionUtils';
import { useTimelineStore } from '@state/timelineStore';

interface PreviewPanelProps {
    interactive?: boolean;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ interactive = true }) => {
    const ctx = useVisualizer();
    const { canvasRef, exportSettings } = ctx;
    const view = useTimelineStore((s) => s.timelineView);
    const { selectElement, updateElementConfig, incrementPropertyPanelRefresh } = useSceneSelection();
    const width = exportSettings.width;
    const height = exportSettings.height;
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

    // Thin wrapper handlers delegating to extracted utilities
    const visualizerInstance = (ctx as any).visualizer;
    const handlerDeps = useMemo(() => ({
        canvasRef,
        visualizer: visualizerInstance,
        selectElement,
        updateElementConfig,
        incrementPropertyPanelRefresh
    }), [canvasRef, visualizerInstance, selectElement, updateElementConfig, incrementPropertyPanelRefresh]);

    const depsRef = useRef(handlerDeps);
    depsRef.current = handlerDeps;

    const draggingRef = useRef(false);

    const handleCanvasMouseMoveWindow = useCallback((event: MouseEvent) => {
        if (!draggingRef.current) return;
        onCanvasMouseMove(event, depsRef.current);
    }, []);

    const handleCanvasMouseUpWindow = useCallback((event: MouseEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        onCanvasMouseUp(event, depsRef.current);
        window.removeEventListener('mousemove', handleCanvasMouseMoveWindow);
        window.removeEventListener('mouseup', handleCanvasMouseUpWindow);
    }, [handleCanvasMouseMoveWindow]);

    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', handleCanvasMouseMoveWindow);
            window.removeEventListener('mouseup', handleCanvasMouseUpWindow);
        };
    }, [handleCanvasMouseMoveWindow, handleCanvasMouseUpWindow]);

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        draggingRef.current = true;
        window.addEventListener('mousemove', handleCanvasMouseMoveWindow);
        window.addEventListener('mouseup', handleCanvasMouseUpWindow);
        onCanvasMouseDown(e, handlerDeps);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => onCanvasMouseMove(e, handlerDeps);
    const handleCanvasMouseUp = (e: React.MouseEvent) => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', handleCanvasMouseMoveWindow);
        window.removeEventListener('mouseup', handleCanvasMouseUpWindow);
        onCanvasMouseUp(e, handlerDeps);
    };
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
                        maxHeight: '100%',
                        pointerEvents: interactive ? 'auto' : 'none'
                    }}
                    onMouseDown={interactive ? handleCanvasMouseDown : undefined}
                    onMouseMove={interactive ? handleCanvasMouseMove : undefined}
                    onMouseUp={interactive ? handleCanvasMouseUp : undefined}
                    onMouseLeave={interactive ? handleCanvasMouseLeave : undefined}
                ></canvas>
            </div>

            {/* Playback controls removed; use Timeline panel controls instead */}
        </div>
    );
};

export default PreviewPanel;
