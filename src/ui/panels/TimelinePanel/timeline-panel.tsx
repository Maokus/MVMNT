import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { selectMidiTracks, selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from '../TransportControls';
import TrackList from './track-list';
import TrackLanes from './TrackLanes';
import TimelineRuler from './TimelineRuler';
import { useVisualizer } from '@context/VisualizerContext';
import { secondsToBars, secondsToBeatsSelector } from '@state/selectors/timing';

const TimelinePanel: React.FC = () => {
    const { visualizer } = useVisualizer();
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const fileRef = useRef<HTMLInputElement | null>(null);
    // Scroll containers for sync (Phase 2)
    const leftScrollRef = useRef<HTMLDivElement | null>(null);
    const rightScrollRef = useRef<HTMLDivElement | null>(null);
    const isSyncingRef = useRef(false);

    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        await addMidiTrack({ name: f.name.replace(/\.[^/.]+$/, ''), file: f });
        if (fileRef.current) fileRef.current.value = '';
    };

    // Optional: on mount, nudge visualizer play range to current ruler state (no-op when already synced)
    useEffect(() => {
        if (!visualizer) return;
        try {
            const { startSec, endSec } = useTimelineStore.getState().timelineView;
            const { loopEnabled, loopStartSec, loopEndSec } = useTimelineStore.getState().transport;
            const loopActive = !!loopEnabled && typeof loopStartSec === 'number' && typeof loopEndSec === 'number' && loopEndSec > loopStartSec;
            visualizer.setPlayRange?.(loopActive ? (loopStartSec as number) : startSec, loopActive ? (loopEndSec as number) : endSec);
        } catch { }
    }, [visualizer]);

    // Scroll sync handlers: mirror vertical scroll between left (track list) and right (lanes)
    const onLeftScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
        if (isSyncingRef.current) return;
        const left = e.currentTarget;
        const right = rightScrollRef.current;
        if (!right) return;
        if (right.scrollTop !== left.scrollTop) {
            isSyncingRef.current = true;
            right.scrollTop = left.scrollTop;
            // release flag on next frame
            requestAnimationFrame(() => { isSyncingRef.current = false; });
        }
    };
    const onRightScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
        if (isSyncingRef.current) return;
        const right = e.currentTarget;
        const left = leftScrollRef.current;
        if (!left) return;
        if (left.scrollTop !== right.scrollTop) {
            isSyncingRef.current = true;
            left.scrollTop = right.scrollTop;
            requestAnimationFrame(() => { isSyncingRef.current = false; });
        }
    };

    // Phase 3: wheel zoom & pan handlers on the right container
    const setTimelineView = useTimelineStore((s) => s.setTimelineView);
    const view = useTimelineStore((s) => s.timelineView);
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const currentTime = useTimelineStore((s) => s.timeline.currentTimeSec);
    const [follow, setFollow] = useState(false);
    const rightDragRef = useRef<{ active: boolean; startClientX: number; startView: { s: number; e: number } } | null>(null);

    const setRowHeight = useTimelineStore((s) => s.setRowHeight);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const onRightWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
        // Map pinch (ctrl/meta) to zoom and horizontal wheel (deltaX) to pan; allow vertical scroll to pass through unchanged.
        const container = rightScrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const x = Math.max(0, Math.min(width, e.clientX - rect.left));
        const range = Math.max(0.001, view.endSec - view.startSec);
        const tAtCursor = view.startSec + (x / Math.max(1, width)) * range;
        const MIN_RANGE = 0.05; // 50ms min zoom
        const MAX_RANGE = 60 * 60 * 24; // 24h max

        const isZoom = e.ctrlKey || e.metaKey; // pinch-zoom gesture
        // If zooming with Shift held, treat as vertical zoom of track height instead of time zoom.
        if (isZoom && e.shiftKey) {
            e.preventDefault();
            const factor = Math.exp(-Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 120) * 0.2);
            setRowHeight(rowHeight * factor);
            return;
        }
        // Only pan horizontally when there is meaningful horizontal delta; otherwise let vertical scroll happen (for track list syncing via native scrollbars).
        const isPanH = !isZoom && Math.abs(e.deltaX) > Math.abs(e.deltaY);

        if (isZoom) {
            e.preventDefault();
            e.stopPropagation();
            // Wheel delta: positive => scroll down => zoom out; negative => zoom in
            const zoomFactor = Math.exp(-Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 120) * 0.2);
            let newRange = Math.min(MAX_RANGE, Math.max(MIN_RANGE, range * zoomFactor));
            // Keep cursor time stable: adjust start/end around tAtCursor
            const tRel = (tAtCursor - view.startSec) / range; // 0..1
            const newStart = tAtCursor - tRel * newRange;
            const newEnd = newStart + newRange;
            setTimelineView(newStart, newEnd);
            return;
        }
        if (isPanH) {
            e.preventDefault();
            // Horizontal pan proportional to wheel deltaX only
            const delta = e.deltaX / Math.max(1, width);
            const shift = delta * range;
            setTimelineView(view.startSec + shift, view.endSec + shift);
            return;
        }
        // Default: allow vertical scroll to bubble (do not call preventDefault)
    };

    const onRightPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.button !== 1) return; // middle button drag to pan
        const container = rightScrollRef.current;
        if (!container) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        rightDragRef.current = { active: true, startClientX: e.clientX, startView: { s: view.startSec, e: view.endSec } };
        e.preventDefault();
    };
    const onRightPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const drag = rightDragRef.current;
        if (!drag?.active) return;
        const container = rightScrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const range = Math.max(0.001, drag.startView.e - drag.startView.s);
        const dx = e.clientX - drag.startClientX;
        const shift = (dx / Math.max(1, width)) * range;
        setTimelineView(drag.startView.s - shift, drag.startView.e - shift);
    };
    const onRightPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (rightDragRef.current?.active) {
            rightDragRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        }
    };

    // Prevent browser gesture zoom on Safari (gesturestart/gesturechange/gestureend)
    useEffect(() => {
        const el = rightScrollRef.current;
        if (!el) return;
        const prevent = (ev: Event) => {
            ev.preventDefault();
        };
        el.addEventListener('gesturestart', prevent as EventListener, { passive: false } as any);
        el.addEventListener('gesturechange', prevent as EventListener, { passive: false } as any);
        el.addEventListener('gestureend', prevent as EventListener, { passive: false } as any);
        return () => {
            el.removeEventListener('gesturestart', prevent as EventListener);
            el.removeEventListener('gesturechange', prevent as EventListener);
            el.removeEventListener('gestureend', prevent as EventListener);
        };
    }, []);

    // Optional auto-follow playhead: keep playhead within view, nudging the window when it exits right 85% or left 10%
    useEffect(() => {
        if (!follow || !isPlaying) return;
        const range = Math.max(0.001, view.endSec - view.startSec);
        const left = view.startSec + range * 0.1;
        const right = view.startSec + range * 0.85;
        if (currentTime < left) {
            const newStart = currentTime - range * 0.3;
            setTimelineView(newStart, newStart + range);
        } else if (currentTime > right) {
            const newStart = currentTime - range * 0.7;
            setTimelineView(newStart, newStart + range);
        }
    }, [currentTime, follow, isPlaying, view.startSec, view.endSec, setTimelineView]);

    return (
        <div className="timeline-panel" role="region" aria-label="Timeline panel">
            {/* Header: left add-track + time indicator, center transport, right view + loop + quantize */}
            <div className="timeline-header grid grid-cols-3 items-center px-2 py-1 bg-neutral-900/40 border-b border-neutral-800">
                {/* Left: Add track */}
                <div className="flex items-center gap-3">
                    <label className="px-2 py-1 border border-neutral-700 rounded cursor-pointer text-xs font-medium bg-neutral-900/50 hover:bg-neutral-800/60">
                        Add MIDI Track
                        <input ref={fileRef} type="file" accept=".mid,.midi" className="hidden" onChange={handleAddFile} />
                    </label>
                    <TimeIndicator />
                </div>
                {/* Center: transport buttons only */}
                <div className="flex items-center justify-center justify-self-center">
                    <TransportControls />
                </div>
                {/* Right: timeline view + loop/quantize buttons */}
                <div className="justify-self-end">
                    <HeaderRightControls follow={follow} setFollow={setFollow} />
                </div>
            </div>
            <div className="timeline-body flex items-stretch gap-0">
                {/* Left: Track list */}
                <div
                    className="tracklist-container w-60 shrink-0 overflow-y-auto border-r border-neutral-800"
                    ref={leftScrollRef}
                    onScroll={onLeftScroll}
                >
                    <TrackList trackIds={trackIds} />
                </div>

                {/* Right: Ruler stacked above lanes */}
                <div className="flex-1 min-w-0 min-h-0">
                    {/* Single scroll container to keep ruler sticky and horizontal-scrollable together with lanes */}
                    <div
                        className="relative w-full h-full overflow-auto "
                        ref={rightScrollRef}
                        onScroll={onRightScroll}
                        onWheel={onRightWheel}
                        onPointerDown={onRightPointerDown}
                        onPointerMove={onRightPointerMove}
                        onPointerUp={onRightPointerUp}
                        style={{ overscrollBehavior: 'contain', overflowX: 'hidden' }}
                    >
                        {/* Sticky ruler */}
                        <div className="sticky top-0 z-10">
                            <TimelineRuler />
                        </div>
                        {/* Lanes content below */}
                        <TrackLanes trackIds={trackIds} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimelinePanel;

// Time indicator component (moved to the left header beside Add MIDI Track)
const TimeIndicator: React.FC = () => {
    const current = useTimelineStore((s) => s.timeline.currentTimeSec);
    const beats = useTimelineStore((s) => secondsToBeatsSelector(s, s.timeline.currentTimeSec));
    const bars = useTimelineStore((s) => secondsToBars(s, s.timeline.currentTimeSec));
    const fmt = (s: number) => {
        const sign = s < 0 ? '-' : '';
        const abs = Math.abs(s);
        const m = Math.floor(abs / 60);
        const sec = Math.floor(abs % 60);
        const ms = Math.floor((abs * 1000) % 1000);
        return `${sign}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms
            .toString()
            .padStart(3, '0')}`;
    };
    return (
        <div className="flex items-center gap-2 text-[12px] text-neutral-400 select-none">
            <span>t = {fmt(current)}</span>
            <span className="hidden sm:inline">beats: {beats.toFixed(2)}</span>
            <span className="hidden sm:inline">bars: {bars.toFixed(2)}</span>
        </div>
    );
};

// Right-side header controls: view start/end inputs, loop/quantize toggles, current time
const HeaderRightControls: React.FC<{ follow?: boolean; setFollow?: (v: boolean) => void }> = ({ follow, setFollow }) => {
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineView = useTimelineStore((s) => s.setTimelineView);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const setPlaybackRange = useTimelineStore((s) => s.setPlaybackRange);
    const loopEnabled = useTimelineStore((s) => s.transport.loopEnabled);
    const setLoopEnabled = useTimelineStore((s) => s.setLoopEnabled);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);
    // Local input buffers so typing isn't overridden; commit on blur or Enter
    const [startText, setStartText] = useState<string>(() => String(view.startSec));
    const [endText, setEndText] = useState<string>(() => String(view.endSec));
    const [playStartText, setPlayStartText] = useState<string>(() => String(playbackRange?.startSec ?? view.startSec));
    const [playEndText, setPlayEndText] = useState<string>(() => String(playbackRange?.endSec ?? view.endSec));
    useEffect(() => { setStartText(String(view.startSec)); }, [view.startSec]);
    useEffect(() => { setEndText(String(view.endSec)); }, [view.endSec]);
    useEffect(() => { setPlayStartText(String((playbackRange?.startSec ?? view.startSec))); }, [playbackRange?.startSec, view.startSec]);
    useEffect(() => { setPlayEndText(String((playbackRange?.endSec ?? view.endSec))); }, [playbackRange?.endSec, view.endSec]);

    const commitView = (_which: 'start' | 'end') => {
        const sVal = parseFloat(startText);
        const eVal = parseFloat(endText);
        const s = isFinite(sVal) ? sVal : 0;
        const e = isFinite(eVal) ? eVal : s + 1; // ensure some width if end invalid
        setTimelineView(s, e);
    };
    const commitPlay = (_which: 'start' | 'end') => {
        const sVal = parseFloat(playStartText);
        const eVal = parseFloat(playEndText);
        const s = isFinite(sVal) ? sVal : undefined;
        const e = isFinite(eVal) ? eVal : undefined;
        setPlaybackRange(s, e);
    };

    return (
        <div className="flex items-center gap-2 text-[12px]">
            <label className="text-neutral-300 flex items-center gap-1">
                View
                <input
                    aria-label="View start (seconds)"
                    className="number-input w-[80px]"
                    type="number"
                    step={0.01}
                    value={startText}
                    onChange={(e) => setStartText(e.target.value)}
                    onBlur={() => commitView('start')}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitView('start'); }}
                />
                <span>–</span>
                <input
                    aria-label="View end (seconds)"
                    className="number-input w-[80px]"
                    type="number"
                    step={0.01}
                    value={endText}
                    onChange={(e) => setEndText(e.target.value)}
                    onBlur={() => commitView('end')}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitView('end'); }}
                />
            </label>

            <label className="text-neutral-300 flex items-center gap-1">
                Play
                <input
                    aria-label="Playback start (seconds)"
                    className="number-input w-[80px]"
                    type="number"
                    step={0.01}
                    value={playStartText}
                    onChange={(e) => setPlayStartText(e.target.value)}
                    onBlur={() => commitPlay('start')}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitPlay('start'); }}
                />
                <span>–</span>
                <input
                    aria-label="Playback end (seconds)"
                    className="number-input w-[80px]"
                    type="number"
                    step={0.01}
                    value={playEndText}
                    onChange={(e) => setPlayEndText(e.target.value)}
                    onBlur={() => commitPlay('end')}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitPlay('end'); }}
                />
            </label>

            {/* Loop toggle (icon button) */}
            <button
                className={`px-2 py-1 rounded border border-neutral-700 ${loopEnabled ? 'bg-blue-600/70 text-white' : 'bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60'}`}
                title="Toggle loop"
                onClick={() => setLoopEnabled(!loopEnabled)}
            >
                ⟲
            </button>
            {/* Loop start/end inputs removed; edit via ruler braces only */}

            {/* Quantize toggle (Q button) */}
            <button
                className={`px-2 py-1 rounded border border-neutral-700 ${quantize === 'bar' ? 'bg-blue-600/70 text-white' : 'bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60'}`}
                title="Toggle quantize to bar"
                onClick={() => setQuantize(quantize === 'bar' ? 'off' : 'bar')}
            >
                Q
            </button>

            {/* Follow playhead toggle */}
            <button
                className={`px-2 py-1 rounded border border-neutral-700 ${follow ? 'bg-blue-600/70 text-white' : 'bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60'}`}
                title="Auto-follow playhead"
                onClick={() => setFollow && setFollow(!follow)}
            >
                ▶︎⇢
            </button>

        </div>
    );
};
