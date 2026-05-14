/**
 * Resize-handle drag logic for AutomationCurvePane.
 * Tracks a pointer-captured drag on the bottom edge to adjust pane height.
 */

import { useCallback, useRef } from 'react';

interface UseResizeHandleOptions {
    channelId: string;
    height: number;
    setHeight: (channelId: string, height: number) => void;
}

export interface ResizeHandlers {
    handleResizeDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    handleResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    handleResizeUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useResizeHandle({ channelId, height, setHeight }: UseResizeHandleOptions): ResizeHandlers {
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

    const handleResizeDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            dragRef.current = { startY: e.clientY, startHeight: height };
        },
        [height],
    );

    const handleResizeMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragRef.current) return;
            const { startY, startHeight } = dragRef.current;
            setHeight(channelId, startHeight + (e.clientY - startY));
        },
        [channelId, setHeight],
    );

    const handleResizeUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragRef.current) return;
            try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            dragRef.current = null;
        },
        [],
    );

    return { handleResizeDown, handleResizeMove, handleResizeUp };
}
