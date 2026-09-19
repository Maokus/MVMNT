import { useLayoutEffect, useRef } from 'react';
import { getPreviewTiles } from './previewGeometry';

export interface PreviewPaintArea {
    width: number;
    height: number;
    scale: number;
    pixelX: number;
    pixelWidth: number;
    invalidate: () => void;
    isCurrent: () => boolean;
}

export type PreviewPainter = (context: CanvasRenderingContext2D, area: PreviewPaintArea) => void;

/** Viewport-sized raster surface shared by MIDI and audio previews. */
export function PreviewCanvas({ draw, trackId }: { draw: PreviewPainter; trackId?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const container = ref.current;
        if (!container) return;
        let frame = 0;
        let active = true;
        let densityQuery: MediaQueryList | undefined;
        const render = () => {
            frame = 0;
            const { width, height } = container.getBoundingClientRect();
            const scale = window.devicePixelRatio || 1;
            const tiles = width > 0 && height > 0 ? getPreviewTiles(width, height, scale) : [];
            const count = Math.max(1, tiles.length);
            while (container.children.length > count) container.lastElementChild?.remove();
            while (container.children.length < count) container.appendChild(document.createElement('canvas'));
            Array.from(container.children).forEach((child, index) => {
                const canvas = child as HTMLCanvasElement;
                if (trackId) canvas.dataset.track = trackId;
                const tile = tiles[index];
                if (!tile) {
                    canvas.width = canvas.height = 0;
                    return;
                }
                canvas.style.cssText = `position:absolute;left:${tile.pixelX / scale}px;top:0;width:${tile.pixelWidth / scale}px;height:${height}px;display:block`;
                canvas.width = tile.pixelWidth;
                canvas.height = Math.max(1, Math.ceil(height * scale));
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.setTransform(scale, 0, 0, canvas.height / height, -tile.pixelX, 0);
                draw(ctx, { width, height, scale, ...tile, invalidate: schedule, isCurrent: () => active });
            });
        };
        const schedule = () => {
            if (active && !frame) frame = requestAnimationFrame(render);
        };
        const watchDensity = () => {
            densityQuery?.removeEventListener('change', watchDensity);
            densityQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
            densityQuery?.addEventListener('change', watchDensity);
            schedule();
        };
        render();
        const observer = new ResizeObserver(schedule);
        observer.observe(container);
        watchDensity();
        return () => {
            active = false;
            cancelAnimationFrame(frame);
            observer.disconnect();
            densityQuery?.removeEventListener('change', watchDensity);
        };
    }, [draw, trackId]);
    return <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" />;
}
