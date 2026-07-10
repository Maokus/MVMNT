import { useRef, useState } from 'react';
import type React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { useTickScale } from './useTickScale';

interface UseMarqueeSelectOptions {
    containerRef: React.RefObject<HTMLDivElement | null>;
    trackIds: string[];
    width: number;
    activeTab: 'clips' | 'automation';
}

export function useMarqueeSelect({ containerRef, trackIds, width, activeTab }: UseMarqueeSelectOptions) {
    const marqueeRef = useRef<null | { startX: number; startY: number; currentX: number; currentY: number; active: boolean }>(null);
    const [marquee, setMarquee] = useState<null | { x1: number; x2: number; y1: number; y2: number }>(null);
    const selectClipTimeline = useSelectionStore((s) => s.selectClipTimeline);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const { toTick } = useTickScale();

    const resolveTrackAtY = (y: number): string | null => {
        if (!trackIds.length) return null;
        const index = Math.max(0, Math.min(trackIds.length - 1, Math.floor(y / Math.max(1, rowHeight))));
        return trackIds[index] ?? null;
    };

    const resolveTracksBetween = (y1: number, y2: number): string[] => {
        if (!trackIds.length) return [];
        const minIndex = Math.max(0, Math.min(trackIds.length - 1, Math.floor(Math.min(y1, y2) / Math.max(1, rowHeight))));
        const maxIndex = Math.max(0, Math.min(trackIds.length - 1, Math.floor(Math.max(y1, y2) / Math.max(1, rowHeight))));
        return trackIds.slice(minIndex, maxIndex + 1);
    };

    const onBackgroundPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.button !== 0) return;
        if (activeTab !== 'clips') return;
        if (!containerRef.current) return;
        const target = e.target as HTMLElement;
        if (target?.closest('[data-clip="1"]')) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        marqueeRef.current = { startX: x, startY: y, currentX: x, currentY: y, active: true };
        setMarquee({ x1: x, x2: x, y1: y, y2: y });
    };

    const onBackgroundPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const m = marqueeRef.current;
        if (!m?.active || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        m.currentX = e.clientX - rect.left;
        m.currentY = e.clientY - rect.top;
        setMarquee({ x1: m.startX, x2: m.currentX, y1: m.startY, y2: m.currentY });
    };

    const onBackgroundPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const m = marqueeRef.current;
        marqueeRef.current = null;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        if (!m || !containerRef.current) {
            setMarquee(null);
            return;
        }
        const x1 = Math.min(m.startX, m.currentX);
        const x2 = Math.max(m.startX, m.currentX);
        const y1 = Math.min(m.startY, m.currentY);
        const y2 = Math.max(m.startY, m.currentY);
        const w = Math.max(1, width);

        if (Math.abs(x2 - x1) < 3 && Math.abs(y2 - y1) < 3) {
            const trackId = resolveTrackAtY(m.startY);
            if (trackId) {
                selectClipTimeline({
                    type: 'point',
                    point: { trackId, tick: Math.round(toTick(m.startX, w)) },
                });
            } else {
                selectClipTimeline(null);
            }
        } else {
            const startTick = Math.round(toTick(x1, w));
            const endTick = Math.round(toTick(x2, w));
            const selectedTrackIds = resolveTracksBetween(y1, y2);
            if (selectedTrackIds.length) {
                selectClipTimeline({
                    type: 'range',
                    range: {
                        startTick: Math.min(startTick, endTick),
                        endTick: Math.max(startTick, endTick),
                        trackIds: selectedTrackIds,
                    },
                });
            } else {
                selectClipTimeline(null);
            }
        }
        setMarquee(null);
    };

    return { marquee, onBackgroundPointerDown, onBackgroundPointerMove, onBackgroundPointerUp };
}
