import { useState, useCallback, useRef, useEffect } from 'react';
import type { DragEventHandler } from 'react';

interface UseFileDropOptions {
    importFiles: (files: File[]) => Promise<void>;
}

export function useFileDrop({ importFiles }: UseFileDropOptions) {
    const dragCounterRef = useRef(0);
    const [isDragActive, setIsDragActive] = useState(false);

    // Ensure overlay clears if the user drops outside the panel or cancels the drag
    useEffect(() => {
        const resetDragState = () => {
            dragCounterRef.current = 0;
            setIsDragActive(false);
        };
        window.addEventListener('drop', resetDragState);
        window.addEventListener('dragend', resetDragState);
        return () => {
            window.removeEventListener('drop', resetDragState);
            window.removeEventListener('dragend', resetDragState);
        };
    }, []);

    const hasFiles = useCallback((dt: DataTransfer | null) => {
        if (!dt) return false;
        if (dt.items && dt.items.length) {
            return Array.from(dt.items).some((item) => item.kind === 'file');
        }
        if (dt.files && dt.files.length) return true;
        const types = dt.types ? Array.from(dt.types) : [];
        return types.includes('Files');
    }, []);

    const onPanelDragEnter = useCallback<DragEventHandler<HTMLDivElement>>(
        (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current += 1;
            setIsDragActive(true);
        },
        [hasFiles]
    );

    const onPanelDragOver = useCallback<DragEventHandler<HTMLDivElement>>(
        (e) => {
            if (!isDragActive && !hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        },
        [hasFiles, isDragActive]
    );

    const onPanelDragLeave = useCallback<DragEventHandler<HTMLDivElement>>(
        (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
            if (dragCounterRef.current === 0) {
                setIsDragActive(false);
            }
        },
        [hasFiles]
    );

    const onPanelDrop = useCallback<DragEventHandler<HTMLDivElement>>(
        (e) => {
            // Always clear overlay state on drop, even if the browser doesn't expose file items.
            dragCounterRef.current = 0;
            setIsDragActive(false);
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer.files ?? []);
            if (!files.length) return;
            void importFiles(files);
        },
        [hasFiles, importFiles]
    );

    const onPanelDropCapture = useCallback<DragEventHandler<HTMLDivElement>>(() => {
        // Ensure the overlay clears even when a child drop handler stops propagation.
        dragCounterRef.current = 0;
        setIsDragActive(false);
    }, []);

    return {
        isDragActive,
        onPanelDragEnter,
        onPanelDragOver,
        onPanelDragLeave,
        onPanelDrop,
        onPanelDropCapture,
    };
}
