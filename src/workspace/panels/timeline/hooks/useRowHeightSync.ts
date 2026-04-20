import { useState, useLayoutEffect, useEffect, useRef, useCallback } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { selectVisibleAutomationRowCount, selectAutomatedElements } from '@automation/selectors';
import { RULER_HEIGHT } from '../constants';

interface UseRowHeightSyncOptions {
    activeTab: 'clips' | 'automation';
    trackIds: string[];
}

/**
 * Measures the timeline body height and auto-sizes track rows to fill the available space.
 * Returns a ref to attach to the timeline body element.
 */
export function useRowHeightSync({ activeTab, trackIds }: UseRowHeightSyncOptions) {
    const timelineBodyRef = useRef<HTMLDivElement | null>(null);
    const [bodyHeight, setBodyHeight] = useState(0);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const setRowHeight = useTimelineStore((s) => s.setRowHeight);
    const trackCount = trackIds.length;
    const automationRowCount = useSceneStore(selectVisibleAutomationRowCount);
    const hasAutomation = useSceneStore(useCallback((s) => selectAutomatedElements(s).length > 0, []));

    useLayoutEffect(() => {
        const el = timelineBodyRef.current;
        if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setBodyHeight(Math.max(0, Math.round(rect.height)));
        };
        update();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => update());
            observer.observe(el);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    useEffect(() => {
        if (bodyHeight <= RULER_HEIGHT) return;
        if (activeTab === 'clips') {
            if (!trackCount) return;
            const usable = bodyHeight - RULER_HEIGHT;
            if (usable <= 0) return;
            const desired = usable / trackCount;
            const clamped = Math.max(16, Math.min(160, desired));
            if (Math.abs(clamped - rowHeight) > 0.5) {
                setRowHeight(clamped);
            }
        }
    }, [bodyHeight, trackCount, rowHeight, setRowHeight, automationRowCount, hasAutomation, activeTab]);

    return { timelineBodyRef };
}
