import { useRef, useState } from 'react';
import type React from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
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
    const marqueeRef = useRef<null | { startX: number; currentX: number; active: boolean }>(null);
    const [marquee, setMarquee] = useState<null | { x1: number; x2: number }>(null);
    const selectTracks = useSelectionStore((s) => s.selectTracks);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const midiCache = useTimelineStore((s) => s.midiCache);
    const { toX } = useTickScale();

    const onBackgroundPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.button !== 0) return;
        if (activeTab !== 'clips') return;
        if (!containerRef.current) return;
        const target = e.target as HTMLElement;
        if (target?.closest('[data-clip="1"]')) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        marqueeRef.current = { startX: x, currentX: x, active: true };
        setMarquee({ x1: x, x2: x });
    };

    const onBackgroundPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const m = marqueeRef.current;
        if (!m?.active || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        m.currentX = e.clientX - rect.left;
        setMarquee({ x1: m.startX, x2: m.currentX });
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
        const w = Math.max(1, width);
        const ppq = CANONICAL_PPQ;
        const selected: string[] = [];

        for (const id of trackIds) {
            const t = tracksMap[id];
            if (!t) continue;
            if (t.type === 'midi') {
                const cacheKey = t.midiSourceId ?? id;
                const cache = midiCache[cacheKey];
                const notes = cache?.notesRaw || [];
                if (notes.length === 0) continue;
                const rawStart = notes.reduce(
                    (acc, n) => Math.min(acc, n.startBeat != null ? Math.round(n.startBeat * ppq) : acc),
                    Number.POSITIVE_INFINITY
                );
                const rawEnd = notes.reduce(
                    (acc, n) => Math.max(acc, n.endBeat != null ? Math.round(n.endBeat * ppq) : acc),
                    0
                );
                const regionStart =
                    typeof t.regionStartTick === 'number' ? Math.max(rawStart, t.regionStartTick) : rawStart;
                const regionEnd = typeof t.regionEndTick === 'number' ? Math.min(rawEnd, t.regionEndTick) : rawEnd;
                const absStart = Math.max(0, (t.offsetTicks || 0) + Math.max(0, regionStart));
                const absEnd = Math.max(absStart, (t.offsetTicks || 0) + Math.max(0, regionEnd));
                if (!(toX(absEnd, w) < x1 || toX(absStart, w) > x2)) selected.push(id);
            } else if (t.type === 'audio') {
                const regionStart = t.regionStartTick ?? 0;
                const regionEnd = t.regionEndTick ?? (useTimelineStore.getState().audioCache[id]?.durationTicks || 0);
                const absStart = Math.max(0, (t.offsetTicks || 0) + regionStart);
                const absEnd = Math.max(absStart, (t.offsetTicks || 0) + regionEnd);
                if (!(toX(absEnd, w) < x1 || toX(absStart, w) > x2)) selected.push(id);
            }
        }

        if (Math.abs(x2 - x1) < 3) {
            selectTracks([]);
        } else {
            selectTracks(selected);
        }
        setMarquee(null);
    };

    return { marquee, onBackgroundPointerDown, onBackgroundPointerMove, onBackgroundPointerUp };
}
