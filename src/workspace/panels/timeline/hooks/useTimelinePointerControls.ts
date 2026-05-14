import { useState, useRef, useEffect } from 'react';
import type { PointerEventHandler } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { zoomAround, isEditableTarget } from '../utils/timelineNavUtils';

/**
 * Handles all pointer and touch gesture interactions on the timeline right pane:
 * - Middle-button drag to pan
 * - Space + left-drag to pan
 * - Pinch-to-zoom (touch)
 * - Ctrl/Cmd + wheel to zoom around cursor
 * - Horizontal wheel scroll to pan
 * - Scroll-left sync: translates native scroll into tick view shifts
 * - Safari gesture prevention
 * - Space key tracking (to coordinate with play/pause)
 *
 * Returns refs and event handlers to attach to the DOM.
 */
export function useTimelinePointerControls() {
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const view = useTimelineStore((s) => s.timelineView);

    const lanesScrollRef = useRef<HTMLDivElement | null>(null);
    const [rightPaneEl, setRightPaneEl] = useState<HTMLDivElement | null>(null);

    const rightDragRef = useRef<{ active: boolean; startClientX: number; startView: { s: number; e: number } } | null>(null);
    const spaceDownRef = useRef(false);
    const isPointerDownRef = useRef(false);
    const spaceDragRef = useRef<{ startClientX: number; startView: { s: number; e: number } } | null>(null);
    const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
    const pinchRef = useRef<{ dist: number; startView: { s: number; e: number }; pivotTick: number } | null>(null);

    const onRightPointerDown: PointerEventHandler<HTMLDivElement> = (e) => {
        activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

        // Middle button — drag to pan
        if (e.button === 1) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            rightDragRef.current = { active: true, startClientX: e.clientX, startView: { s: view.startTick, e: view.endTick } };
            e.preventDefault();
            return;
        }

        // Pinch: second pointer arrived — record pinch start state
        if (activePointersRef.current.size >= 2) {
            const pts = [...activePointersRef.current.values()];
            const dx = pts[0].clientX - pts[1].clientX;
            const dy = pts[0].clientY - pts[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const centerClientX = (pts[0].clientX + pts[1].clientX) / 2;
            const container = lanesScrollRef.current;
            const rect = container?.getBoundingClientRect();
            const pivotFrac = rect ? (centerClientX - rect.left) / Math.max(1, rect.width) : 0.5;
            const pivotTick = view.startTick + pivotFrac * (view.endTick - view.startTick);
            pinchRef.current = { dist, startView: { s: view.startTick, e: view.endTick }, pivotTick };
            return;
        }

        // Left button + Space held — space-drag pan
        if (e.button === 0) {
            isPointerDownRef.current = true;
            if (spaceDownRef.current) {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                spaceDragRef.current = { startClientX: e.clientX, startView: { s: view.startTick, e: view.endTick } };
                e.preventDefault();
            }
        }
    };

    const onRightPointerMove: PointerEventHandler<HTMLDivElement> = (e) => {
        activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

        // Middle-button drag pan
        const drag = rightDragRef.current;
        if (drag?.active) {
            const container = lanesScrollRef.current;
            if (!container) return;
            const width = Math.max(1, container.getBoundingClientRect().width);
            const range = Math.max(1, drag.startView.e - drag.startView.s);
            const shift = Math.round(((e.clientX - drag.startClientX) / width) * range);
            setTimelineViewTicks(drag.startView.s - shift, drag.startView.e - shift);
            return;
        }

        // Space-drag pan
        const spaceDrag = spaceDragRef.current;
        if (spaceDrag) {
            const container = lanesScrollRef.current;
            if (!container) return;
            const width = Math.max(1, container.getBoundingClientRect().width);
            const range = Math.max(1, spaceDrag.startView.e - spaceDrag.startView.s);
            const shift = Math.round((-(e.clientX - spaceDrag.startClientX) / width) * range);
            setTimelineViewTicks(spaceDrag.startView.s + shift, spaceDrag.startView.e + shift);
            return;
        }

        // Pinch-to-zoom
        const pinch = pinchRef.current;
        if (pinch && activePointersRef.current.size >= 2) {
            const pts = [...activePointersRef.current.values()];
            const dx = pts[0].clientX - pts[1].clientX;
            const dy = pts[0].clientY - pts[1].clientY;
            const newDist = Math.sqrt(dx * dx + dy * dy);
            const factor = pinch.dist / Math.max(1, newDist); // smaller dist = zoom in = factor < 1
            const { newStart, newEnd } = zoomAround(pinch.startView.s, pinch.startView.e, pinch.pivotTick, factor);
            setTimelineViewTicks(newStart, newEnd);
        }
    };

    const onRightPointerUp: PointerEventHandler<HTMLDivElement> = (e) => {
        activePointersRef.current.delete(e.pointerId);

        if (rightDragRef.current?.active) {
            rightDragRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        }
        if (spaceDragRef.current) {
            spaceDragRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        }
        if (activePointersRef.current.size < 2) {
            pinchRef.current = null;
        }
        if (e.button === 0) {
            isPointerDownRef.current = false;
        }
    };

    // Non-passive wheel handler: Ctrl/Cmd+scroll zooms; horizontal scroll pans; vertical scroll passes through
    useEffect(() => {
        if (!rightPaneEl) return;
        const handleWheel = (e: WheelEvent) => {
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const range = Math.max(1, endTick - startTick);
            const rect = rightPaneEl.getBoundingClientRect();
            const width = Math.max(1, rect.width);

            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const cursorFrac = (e.clientX - rect.left) / width;
                const pivotTick = startTick + cursorFrac * range;
                const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
                const { newStart, newEnd } = zoomAround(startTick, endTick, pivotTick, factor);
                state.setTimelineViewTicks(newStart, newEnd);
            } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                // Horizontal scroll dominates → pan; consume to prevent browser back-navigation
                e.preventDefault();
                const shift = Math.round((e.deltaX / width) * range);
                if (shift !== 0) {
                    state.setTimelineViewTicks(startTick + shift, endTick + shift);
                }
            }
            // Vertical-dominant scroll → do not preventDefault; let the container scroll normally
        };
        rightPaneEl.addEventListener('wheel', handleWheel, { passive: false });
        return () => rightPaneEl.removeEventListener('wheel', handleWheel);
    }, [rightPaneEl]);

    // Space key tracking — allows space-drag pan while preventing conflict with play/pause
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            if (isEditableTarget(document.activeElement)) return;
            spaceDownRef.current = true;
            // If a left-button drag is already active, consume space so transport doesn't toggle play
            if (isPointerDownRef.current) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            spaceDownRef.current = false;
            spaceDragRef.current = null;
        };
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    // Scroll sync: translate native scroll into tick view shifts (prevents page scroll)
    // rightPaneEl mounting signals that lanesScrollRef.current is also set
    useEffect(() => {
        const el = lanesScrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            const scrollLeft = el.scrollLeft;
            if (Math.abs(scrollLeft) < 1) {
                el.scrollLeft = 0;
                return;
            }
            const width = el.clientWidth || 1;
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const range = Math.max(1, endTick - startTick);
            if (!range) {
                el.scrollLeft = 0;
                return;
            }
            const shift = Math.round((scrollLeft / width) * range);
            if (shift !== 0) {
                state.setTimelineViewTicks(startTick + shift, endTick + shift);
            }
            el.scrollLeft = 0;
        };
        el.addEventListener('scroll', handleScroll);
        return () => el.removeEventListener('scroll', handleScroll);
    // rightPaneEl is the indirect trigger: its state update causes a re-render where
    // lanesScrollRef.current is guaranteed to be populated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rightPaneEl]);

    // Prevent Safari gesture zoom on the lanes container to avoid page zoom side-effects
    useEffect(() => {
        const el = lanesScrollRef.current;
        if (!el) return;
        const prevent = (ev: Event) => { ev.preventDefault(); };
        el.addEventListener('gesturestart', prevent as EventListener, { passive: false } as any);
        el.addEventListener('gesturechange', prevent as EventListener, { passive: false } as any);
        el.addEventListener('gestureend', prevent as EventListener, { passive: false } as any);
        return () => {
            el.removeEventListener('gesturestart', prevent as EventListener);
            el.removeEventListener('gesturechange', prevent as EventListener);
            el.removeEventListener('gestureend', prevent as EventListener);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        lanesScrollRef,
        rightPaneEl,
        setRightPaneEl,
        onRightPointerDown,
        onRightPointerMove,
        onRightPointerUp,
    };
}
