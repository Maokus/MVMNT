import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    FloatingFocusManager,
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import { beatsToTicks, CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from '../TransportControls';
import TrackList from './TrackList';
import TrackLanes from './TrackLanes';
import TimelineRuler from './TimelineRuler';
import { RULER_HEIGHT } from './constants';
import { useVisualizer } from '@context/VisualizerContext';
// Seconds shown are derived from tick on the fly (legacy seconds selectors removed).
import { formatTickAsBBT } from '@core/timing/time-domain';
import { TimingManager } from '@core/timing';
import { beatsToSeconds } from '@core/timing/tempo-utils';
import { FaPlus, FaEllipsisV, FaUndo, FaMagnet } from 'react-icons/fa';
import { sharedTimingManager } from '@state/timelineStore';

const TimelinePanel: React.FC = () => {
    const { visualizer } = useVisualizer();
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const addAudioTrack = useTimelineStore((s) => s.addAudioTrack);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const audioFileRef = useRef<HTMLInputElement | null>(null);
    // Scroll containers for sync
    const lanesScrollRef = useRef<HTMLDivElement | null>(null);
    const timelineBodyRef = useRef<HTMLDivElement | null>(null);
    const [bodyHeight, setBodyHeight] = useState(0);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const setRowHeight = useTimelineStore((s) => s.setRowHeight);
    const trackCount = trackIds.length;

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
        if (!trackCount) return;
        if (bodyHeight <= RULER_HEIGHT) return;
        const usable = bodyHeight - RULER_HEIGHT;
        if (usable <= 0) return;
        const desired = usable / trackCount;
        const clamped = Math.max(16, Math.min(160, desired));
        if (Math.abs(clamped - rowHeight) > 0.5) {
            setRowHeight(clamped);
        }
    }, [bodyHeight, trackCount, rowHeight, setRowHeight]);

    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        await addMidiTrack({ name: f.name.replace(/\.[^/.]+$/, ''), file: f });
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleAddAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const lower = f.name.toLowerCase();
        if (/(\.mid|\.midi)$/.test(lower)) {
            alert('MIDI files are not allowed for audio tracks. Please use an audio file (wav, mp3, ogg, flac, m4a).');
            if (audioFileRef.current) audioFileRef.current.value = '';
            return;
        }
        // Basic file type filter; rely on accept attribute but double-check MIME starts with audio/
        if (!f.type.startsWith('audio/')) {
            alert('Unsupported file type. Please select an audio file.');
            if (audioFileRef.current) audioFileRef.current.value = '';
            return;
        }
        const name = f.name.replace(/\.[^/.]+$/, '');
        await addAudioTrack({ name, file: f });
        if (audioFileRef.current) audioFileRef.current.value = '';
    };

    // Optional: on mount, nudge visualizer play range to current ruler state (no-op when already synced)
    useEffect(() => {
        if (!visualizer) return;
        try {
            const { startTick, endTick } = useTimelineStore.getState().timelineView;
            const state = useTimelineStore.getState();
            const spb = 60 / (state.timeline.globalBpm || 120);
            const map = state.timeline.masterTempoMap;
            const toSec = (tick: number) => beatsToSeconds(map, tick / CANONICAL_PPQ, spb);
            visualizer.setPlayRange?.(toSec(startTick), toSec(endTick));
        } catch { }
    }, [visualizer]);

    // Wheel pan handler on the right container (zoom removed; only horizontal pan via deltaX)
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const view = useTimelineStore((s) => s.timelineView); // contains startTick/endTick canonical
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    // Derived seconds still used for display-only follow heuristics optional; canonical follow in ticks
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    // Auto-follow enabled by default per new UX spec
    const [follow, setFollow] = useState(true);
    const rightDragRef = useRef<{ active: boolean; startClientX: number; startView: { s: number; e: number } } | null>(null);

    const onRightWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
        // Only allow horizontal wheel (deltaX) to pan; vertical scroll passes through. All zoom gestures are disabled.
        const container = lanesScrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const rangeTicks = Math.max(1, view.endTick - view.startTick);
        // Only pan horizontally when there is meaningful horizontal delta; otherwise let vertical scroll happen.
        const isPanH = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        if (isPanH) {
            e.preventDefault();
            // Horizontal pan proportional to wheel deltaX only
            const delta = e.deltaX / Math.max(1, width);
            const shift = Math.round(delta * rangeTicks);
            setTimelineViewTicks(view.startTick + shift, view.endTick + shift);
            return;
        }
        // Default: allow vertical scroll to bubble (do not call preventDefault)
    };

    const onRightPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (e.button !== 1) return; // middle button drag to pan
        const container = lanesScrollRef.current;
        if (!container) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        rightDragRef.current = { active: true, startClientX: e.clientX, startView: { s: view.startTick, e: view.endTick } };
        e.preventDefault();
    };
    const onRightPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const drag = rightDragRef.current;
        if (!drag?.active) return;
        const container = lanesScrollRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const range = Math.max(1, drag.startView.e - drag.startView.s);
        const dx = e.clientX - drag.startClientX;
        const shift = Math.round((dx / Math.max(1, width)) * range);
        setTimelineViewTicks(drag.startView.s - shift, drag.startView.e - shift);
    };
    const onRightPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (rightDragRef.current?.active) {
            rightDragRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        }
    };

    // Keyboard: Delete key removes all currently selected tracks (batch) when focus isn't in a text-editable field.
    useEffect(() => {
        const removeTracks = useTimelineStore.getState().removeTracks;
        const getSelection = () => useTimelineStore.getState().selection.selectedTrackIds;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const active = document.activeElement as HTMLElement | null;
            if (active) {
                const tag = active.tagName;
                const editable = active.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || (active as any).getAttribute?.('role') === 'textbox';
                if (editable) return; // Don't intercept when typing in inputs
            }
            const ids = getSelection();
            if (!ids.length) return;
            removeTracks(ids);
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as any);
    }, []);

    // Prevent browser gesture zoom on Safari within the panel to avoid page zoom side-effects
    useEffect(() => {
        const el = lanesScrollRef.current;
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
        const range = Math.max(1, view.endTick - view.startTick);
        const left = view.startTick + range * 0.1;
        const right = view.startTick + range * 0.85;
        if (currentTick < left) {
            const newStart = currentTick - range * 0.3;
            setTimelineViewTicks(newStart, newStart + range);
        } else if (currentTick > right) {
            const newStart = currentTick - range * 0.7;
            setTimelineViewTicks(newStart, newStart + range);
        }
    }, [currentTick, follow, isPlaying, view.startTick, view.endTick, setTimelineViewTicks]);

    return (
        <div className="timeline-panel flex h-full flex-col" role="region" aria-label="Timeline panel">
            {/* Header: left add-track + time indicator, center transport, right view + loop + quantize */}
            <div className="timeline-header relative z-30 grid flex-none grid-cols-3 items-center border-b border-neutral-800 bg-neutral-900/40 px-2 py-1">
                {/* Left: Add track */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <label className="px-2 py-1 border border-neutral-700 rounded cursor-pointer text-xs font-medium bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1">
                            <FaPlus className="text-neutral-300" />
                            <span>MIDI</span>
                            <input ref={fileRef} type="file" accept=".mid,.midi" className="hidden" onChange={handleAddFile} />
                        </label>
                        <label className="px-2 py-1 border border-emerald-700 rounded cursor-pointer text-xs font-medium bg-emerald-900/40 hover:bg-emerald-800/60 flex items-center gap-1" title="Add Audio Track (wav/mp3/ogg)">
                            <FaPlus className="text-emerald-300" />
                            <span>Audio</span>
                            <input
                                ref={audioFileRef}
                                type="file"
                                accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
                                className="hidden"
                                onChange={handleAddAudio}
                            />
                        </label>
                    </div>
                    <TimeIndicator />
                </div>
                {/* Center: transport buttons only */}
                <div className="flex items-center justify-center justify-self-center">
                    <TransportControls />
                </div>
                {/* Right: timeline view controls with overflow menu */}
                <div className="justify-self-end">
                    <HeaderRightControls follow={follow} setFollow={setFollow} />
                </div>
            </div>
            <div ref={timelineBodyRef} className="timeline-body flex flex-1 items-stretch gap-0 overflow-hidden">
                <div className="flex h-full w-full overflow-hidden">
                    <div className="flex h-full w-full overflow-y-auto overflow-x-hidden">
                        <div className="tracklist-container w-60 shrink-0 border-r border-neutral-800 bg-neutral-900/40">
                            <TrackList trackIds={trackIds} />
                        </div>
                        <div className="flex min-h-full flex-1 flex-col">
                            <div className="sticky top-0 z-10">
                                <TimelineRuler />
                            </div>
                            <div
                                className="relative flex-1 overflow-x-auto"
                                ref={lanesScrollRef}
                                onWheel={onRightWheel}
                                onPointerDown={onRightPointerDown}
                                onPointerMove={onRightPointerMove}
                                onPointerUp={onRightPointerUp}
                                style={{ overscrollBehaviorX: 'contain', overflowY: 'visible' }}
                            >
                                <TrackLanes trackIds={trackIds} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimelinePanel;

// Time indicator component (moved to the left header beside Add MIDI Track)
const TimeIndicator: React.FC = () => {
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const tempoMap = useTimelineStore((s) => s.timeline.masterTempoMap);
    const bpm = useTimelineStore((s) => s.timeline.globalBpm);
    // Use TimingManager for canonical ticksPerQuarter instead of hard-coded constant (was 960 vs core 480 mismatch)
    // Use shared timing manager (singleton) for consistent tick domain
    const ticksPerQuarter = sharedTimingManager.ticksPerQuarter;
    // Derive beats/seconds from tick
    const beatsFloat = currentTick / ticksPerQuarter;
    const barsFloat = beatsFloat / (beatsPerBar || 4);
    // seconds derivation using fallback tempo map util (simplified uniform tempo assumption if no map)
    const spb = 60 / (bpm || 120);
    let seconds = beatsFloat * spb;
    // Use TimingManager for accurate beats->seconds with tempo map if available
    try {
        if (tempoMap && tempoMap.length) {
            // Reuse shared timing manager (already has BPM/tempo map set via store actions)
            seconds = sharedTimingManager.beatsToSeconds(beatsFloat);
        }
    } catch { /* ignore */ }
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
            <span>{formatTickAsBBT(currentTick, ticksPerQuarter, beatsPerBar)}</span>
            <span className="hidden sm:inline">({fmt(seconds)})</span>
            <span className="hidden sm:inline whitespace-nowrap">beats: {beatsFloat.toFixed(2)}</span>
            <span className="hidden sm:inline whitespace-nowrap">bars: {barsFloat.toFixed(2)}</span>
        </div>
    );
};

// Right-side header controls: zoom slider, play start/end inputs, quantize toggle, follow
const HeaderRightControls: React.FC<{ follow?: boolean; setFollow?: (v: boolean) => void }> = ({ follow, setFollow }) => {
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);
    // Global timing state
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const setGlobalBpm = useTimelineStore((s) => s.setGlobalBpm);
    const setBeatsPerBar = useTimelineStore((s) => s.setBeatsPerBar);
    const [menuOpen, setMenuOpen] = useState(false);
    const {
        refs: menuRefs,
        floatingStyles: menuFloatingStyles,
        context: menuContext,
    } = useFloating({
        open: menuOpen,
        onOpenChange: setMenuOpen,
        placement: 'top-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    });
    const menuDismiss = useDismiss(menuContext, { outsidePressEvent: 'mousedown' });
    const menuRole = useRole(menuContext, { role: 'menu' });
    const { getReferenceProps: getMenuReferenceProps, getFloatingProps: getMenuFloatingProps } = useInteractions([
        menuDismiss,
        menuRole,
    ]);
    // Zoom slider state maps to view range width using logarithmic scale
    // Zoom now operates on tick window width using logarithmic mapping
    const MIN_RANGE = 4; // 4 ticks (~1/120 beat at PPQ=480)
    const MAX_RANGE = CANONICAL_PPQ * 60 * 10; // heuristic
    const range = Math.max(1, view.endTick - view.startTick);
    const sliderFromRange = (r: number) => {
        const t = (Math.log(r) - Math.log(MIN_RANGE)) / (Math.log(MAX_RANGE) - Math.log(MIN_RANGE));
        const clamped = Math.max(0, Math.min(1, t));
        return Math.round(clamped * 100);
    };
    const rangeFromSlider = (v: number) => {
        const t = Math.max(0, Math.min(1, v / 100));
        const logR = Math.log(MIN_RANGE) + t * (Math.log(MAX_RANGE) - Math.log(MIN_RANGE));
        return Math.exp(logR);
    };
    const [zoomVal, setZoomVal] = useState<number>(() => sliderFromRange(range));
    useEffect(() => { setZoomVal(sliderFromRange(range)); }, [range]);

    // Local editable buffers so typing isn't instantly overwritten by store updates
    const [localTempo, setLocalTempo] = useState<string>('');
    const [localBeatsPerBar, setLocalBeatsPerBar] = useState<string>('');
    useEffect(() => { setLocalTempo(String(Number.isFinite(globalBpm) ? globalBpm : 120)); }, [globalBpm]);
    useEffect(() => { setLocalBeatsPerBar(String(Number.isFinite(beatsPerBar) ? beatsPerBar : 4)); }, [beatsPerBar]);
    const commitTempo = () => {
        const v = parseFloat(localTempo);
        const value = Number.isFinite(v) && v > 0 ? v : (Number.isFinite(globalBpm) ? globalBpm : 120);
        try { setGlobalBpm(value); } catch { }
        setLocalTempo(String(value));
    };
    const commitBeatsPerBar = () => {
        const v = parseInt(localBeatsPerBar);
        const value = Number.isFinite(v) && v > 0 ? Math.floor(v) : (Number.isFinite(beatsPerBar) ? beatsPerBar : 4);
        try { setBeatsPerBar(value); } catch { }
        setLocalBeatsPerBar(String(value));
    };

    return (
        <div className="flex items-center gap-3 text-[12px] relative">
            {/* Inline tempo + meter controls (migrated from GlobalPropertiesPanel) */}
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-neutral-300" title="Global tempo (BPM)">
                    <span>BPM</span>
                    <input
                        aria-label="Global tempo (BPM)"
                        className="number-input w-[70px]"
                        type="number"
                        min={1}
                        max={400}
                        step={0.1}
                        value={localTempo}
                        onChange={(e) => setLocalTempo(e.target.value)}
                        onBlur={commitTempo}
                        onKeyDown={(e) => { if (e.key === 'Enter') { commitTempo(); (e.currentTarget as any).blur?.(); } }}
                    />
                </label>
                <label className="flex items-center gap-1 text-neutral-300" title="Beats per bar (meter numerator)">
                    <span>BPB</span>
                    <input
                        aria-label="Beats per bar"
                        className="number-input w-[60px]"
                        type="number"
                        min={1}
                        max={16}
                        step={1}
                        value={localBeatsPerBar}
                        onChange={(e) => setLocalBeatsPerBar(e.target.value)}
                        onBlur={commitBeatsPerBar}
                        onKeyDown={(e) => { if (e.key === 'Enter') { commitBeatsPerBar(); (e.currentTarget as any).blur?.(); } }}
                    />
                </label>
            </div>
            {/* Zoom slider remains inline */}
            <label className="text-neutral-300 flex items-center gap-2" title="Adjust timeline zoom">
                <span>Zoom</span>
                <input aria-label="Timeline zoom" className="w-[120px]" type="range" min={0} max={100} step={1} value={zoomVal} onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setZoomVal(v);
                    const newRange = rangeFromSlider(v);
                    const center = (view.startTick + view.endTick) / 2;
                    const newStart = Math.round(center - newRange / 2);
                    const newEnd = Math.round(newStart + newRange);
                    setTimelineViewTicks(newStart, newEnd);
                }} />
                <button className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center gap-1" title="Zoom to scene range" onClick={() => {
                    const sTick = typeof playbackRange?.startTick === 'number' ? playbackRange!.startTick! : view.startTick;
                    const eTick = typeof playbackRange?.endTick === 'number' ? playbackRange!.endTick! : view.endTick;
                    setTimelineViewTicks(sTick, eTick);
                }}>
                    <FaUndo className="text-neutral-300" />
                    <span className="sr-only">Reset Zoom</span>
                </button>
            </label>
            {/* Quantize toggle (moved out of menu) */}
            <button
                aria-label={quantize === 'bar' ? 'Disable bar quantize' : 'Enable bar quantize'}
                title={quantize === 'bar' ? 'Quantize: Bar (click to turn off)' : 'Quantize: Off (click to enable bar snapping)'}
                onClick={() => setQuantize(quantize === 'bar' ? 'off' : 'bar')}
                className={`px-2 py-1 rounded border border-neutral-700 flex items-center justify-center transition-colors ${quantize === 'bar' ? 'bg-blue-600/70 text-white border-blue-400/70' : 'bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800/60'}`}
            >
                <FaMagnet />
            </button>
            {/* Ellipsis menu trigger */}
            <button
                {...getMenuReferenceProps({
                    type: 'button',
                    onClick: () => setMenuOpen((open) => !open),
                    'aria-haspopup': 'menu',
                    'aria-expanded': menuOpen,
                    title: 'Timeline options',
                })}
                ref={menuRefs.setReference}
                className="px-2 py-1 rounded border border-border bg-menubar hover:bg-neutral-800/60 text-neutral-200 flex items-center justify-center text-[12px]"
            >
                <FaEllipsisV />
            </button>
            {menuOpen && (
                <FloatingPortal>
                    <FloatingFocusManager context={menuContext} modal={false} initialFocus={-1}>
                        <div
                            {...getMenuFloatingProps({
                                role: 'menu',
                                'aria-label': 'Timeline options menu',
                                className:
                                    'w-64 rounded border border-border bg-panel/95 p-3 shadow-lg shadow-black/40 flex flex-col gap-3 text-neutral-200 backdrop-blur-sm z-[1000]',
                            })}
                            ref={menuRefs.setFloating}
                            style={menuFloatingStyles}
                        >
                            <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-neutral-300">Auto follow playhead</span>
                                <button
                                    className={`px-2 py-1 rounded border border-neutral-700 ${follow ? 'bg-blue-600/70 text-white' : 'bg-neutral-800/60 text-neutral-200'}`}
                                    onClick={() => setFollow && setFollow(!follow)}
                                    role="menuitemcheckbox"
                                    aria-checked={!!follow}
                                >
                                    {follow ? 'On' : 'Off'}
                                </button>
                            </div>
                            <p className="m-0 text-[11px] leading-snug text-neutral-500">
                                Scene dimensions and debug tools have moved to the scene settings modal next to the scene name.
                            </p>
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </div>
    );
};
