import React, { useEffect } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { useVisualizer } from '@context/VisualizerContext';

/**
 * Clears the canvas selection on a background click. Owned once here rather than per dock,
 * which used to run the same predicate for every mounted dock.
 */
export const ClearSelectionOnBackgroundClick: React.FC = () => {
    const { selectedElementId, clearSelection } = useSceneSelection();
    const { canvasRef } = useVisualizer() as any;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const composed = typeof event.composedPath === 'function' ? event.composedPath() : [];
            const preserveSelection = (composed as EventTarget[]).some(
                (node) => node instanceof HTMLElement && node.dataset?.preserveSelection === 'true'
            );
            if (preserveSelection) return;
            const clickedInsideDock =
                event.target instanceof Element && event.target.closest('[data-dock-side]') !== null;
            const canvasEl: HTMLCanvasElement | null =
                canvasRef?.current || (document.getElementById('canvas') as HTMLCanvasElement | null);
            const previewContainer =
                canvasEl?.closest('[data-preview-container]') ||
                canvasEl?.closest('.canvas-container') ||
                canvasEl?.closest('.preview-panel');
            const clickedInsideCanvas = !!(
                (canvasEl && canvasEl.contains(event.target as Node)) ||
                (previewContainer && previewContainer.contains(event.target as Node))
            );
            if (!clickedInsideDock && !clickedInsideCanvas && selectedElementId) clearSelection();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedElementId, clearSelection, canvasRef]);

    return null;
};
