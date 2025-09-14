import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from '../TransportControls';
import TrackList from './track-list';
import TrackLanes from './TrackLanes';
import TimelineRuler from './TimelineRuler';
import { useVisualizer } from '@context/VisualizerContext';
// Seconds shown are derived from tick on the fly (legacy seconds selectors removed).
import { formatTickAsBBT } from '@core/timing/time-domain';
import { TimingManager } from '@core/timing';
import { beatsToSeconds, secondsToBeats } from '@core/timing/tempo-utils';
import { FaPlus, FaEllipsisV, FaUndo } from 'react-icons/fa';
import { sharedTimingManager } from '@state/timelineStore';

const TimelinePanel: React.FC = () => {
    const { visualizer } = useVisualizer();
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const fileRef = useRef<HTMLInputElement | null>(null);
    // Scroll containers for sync
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
            const { startTick, endTick } = useTimelineStore.getState().timelineView;
            const state = useTimelineStore.getState();
            const spb = 60 / (state.timeline.globalBpm || 120);
            const map = state.timeline.masterTempoMap;
            const toSec = (tick: number) => beatsToSeconds(map, tick / CANONICAL_PPQ, spb);
            visualizer.setPlayRange?.(toSec(startTick), toSec(endTick));
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
        const container = rightScrollRef.current;
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
        const container = rightScrollRef.current;
        if (!container) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        rightDragRef.current = { active: true, startClientX: e.clientX, startView: { s: view.startTick, e: view.endTick } };
        e.preventDefault();
    };
    const onRightPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const drag = rightDragRef.current;
        if (!drag?.active) return;
        const container = rightScrollRef.current;
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

    // Prevent browser gesture zoom on Safari within the panel to avoid page zoom side-effects
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
        <div className="timeline-panel" role="region" aria-label="Timeline panel">
            {/* Header: left add-track + time indicator, center transport, right view + loop + quantize */}
            <div className="timeline-header grid grid-cols-3 items-center px-2 py-1 bg-neutral-900/40 border-b border-neutral-800">
                {/* Left: Add track */}
                <div className="flex items-center gap-3">
                    <label className="px-2 py-1 border border-neutral-700 rounded cursor-pointer text-xs font-medium bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1">
                        <FaPlus className="text-neutral-300" />
                        <span>Add MIDI Track</span>
                        <input ref={fileRef} type="file" accept=".mid,.midi" className="hidden" onChange={handleAddFile} />
                    </label>
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
            <span className="hidden sm:inline">beats: {beatsFloat.toFixed(2)}</span>
            <span className="hidden sm:inline">bars: {barsFloat.toFixed(2)}</span>
        </div>
    );
};

// Right-side header controls: zoom slider, play start/end inputs, quantize toggle, follow
const HeaderRightControls: React.FC<{ follow?: boolean; setFollow?: (v: boolean) => void }> = ({ follow, setFollow }) => {
    const { exportSettings, setExportSettings, debugSettings, setDebugSettings } = useVisualizer();
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const playbackRange = useTimelineStore((s) => s.playbackRange);
    const setPlaybackRangeExplicitTicks = useTimelineStore((s) => s.setPlaybackRangeExplicitTicks);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);
    // Global timing state
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const setGlobalBpm = useTimelineStore((s) => s.setGlobalBpm);
    const setBeatsPerBar = useTimelineStore((s) => s.setBeatsPerBar);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(e.target as any)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);
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

    // Local input buffers for play range so typing isn't overridden; commit on blur or Enter
    // Playback range inputs remain seconds-facing for now; derive defaults from ticks via derived seconds fields
    const startSecDerived = (playbackRange as any)?.startSec ?? (view as any).startSec;
    const endSecDerived = (playbackRange as any)?.endSec ?? (view as any).endSec;
    const [playStartText, setPlayStartText] = useState<string>(() => String(startSecDerived ?? 0));
    const [playEndText, setPlayEndText] = useState<string>(() => String(endSecDerived ?? 0));
    useEffect(() => { setPlayStartText(String(startSecDerived ?? 0)); }, [startSecDerived]);
    useEffect(() => { setPlayEndText(String(endSecDerived ?? 0)); }, [endSecDerived]);
    const commitPlay = (_which: 'start' | 'end') => {
        const sVal = parseFloat(playStartText);
        const eVal = parseFloat(playEndText);
        const s = isFinite(sVal) ? sVal : undefined;
        const e = isFinite(eVal) ? eVal : undefined;
        // Convert seconds -> ticks via store seek path
        if (s == null && e == null) {
            setPlaybackRangeExplicitTicks(undefined, undefined);
            return;
        }
        const state = useTimelineStore.getState();
        const spb = 60 / (state.timeline.globalBpm || 120);
        const map = state.timeline.masterTempoMap;
        const sBeats = typeof s === 'number' ? secondsToBeats(map, s, spb) : undefined;
        const eBeats = typeof e === 'number' ? secondsToBeats(map, e, spb) : undefined;
        const ppq = CANONICAL_PPQ;
        const toTicks = (beats?: number) => (typeof beats === 'number' ? Math.round(beats * ppq) : undefined);
        setPlaybackRangeExplicitTicks(toTicks(sBeats), toTicks(eBeats));
    };

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

    // Local buffer for scene settings so typing doesn't spam context updates
    const [localFps, setLocalFps] = useState<string>(() => String(exportSettings.fps));
    const [localWidth, setLocalWidth] = useState<string>(() => String(exportSettings.width));
    const [localHeight, setLocalHeight] = useState<string>(() => String(exportSettings.height));
    useEffect(() => { setLocalFps(String(exportSettings.fps)); }, [exportSettings.fps]);
    useEffect(() => { setLocalWidth(String(exportSettings.width)); }, [exportSettings.width]);
    useEffect(() => { setLocalHeight(String(exportSettings.height)); }, [exportSettings.height]);
    const commitSceneSetting = (key: 'fps' | 'width' | 'height') => {
        let valStr = key === 'fps' ? localFps : key === 'width' ? localWidth : localHeight;
        let v = parseInt(valStr, 10);
        if (!Number.isFinite(v) || v <= 0) {
            v = (exportSettings as any)[key];
        }
        setExportSettings((prev) => ({ ...prev, [key]: v }));
        if (key === 'fps') setLocalFps(String(v));
        if (key === 'width') setLocalWidth(String(v));
        if (key === 'height') setLocalHeight(String(v));
    };
    return (
        <div className="flex items-center gap-3 text-[12px] relative" ref={menuRef}>
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
            {/* Ellipsis menu trigger */}
            <button aria-haspopup="true" aria-expanded={menuOpen} title="Timeline options" onClick={() => setMenuOpen(!menuOpen)} className="px-2 py-1 rounded border border-neutral-700 bg-neutral-900/60 hover:bg-neutral-800/60 text-neutral-200 flex items-center justify-center">
                <FaEllipsisV />
            </button>
            {menuOpen && (
                <div role="menu" className="absolute right-0 bottom-full mb-1 w-80 rounded border border-neutral-700 bg-neutral-900/95 shadow-lg p-3 flex flex-col gap-4 z-20" aria-label="Timeline options menu">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-300">Quantize (bars)</span>
                        <button className={`px-2 py-1 rounded border border-neutral-700 ${quantize === 'bar' ? 'bg-blue-600/70 text-white' : 'bg-neutral-800/60 text-neutral-200'}`} onClick={() => setQuantize(quantize === 'bar' ? 'off' : 'bar')} role="menuitemcheckbox" aria-checked={quantize === 'bar'}>Q</button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-neutral-300">Auto follow playhead</span>
                        <button className={`px-2 py-1 rounded border border-neutral-700 ${follow ? 'bg-blue-600/70 text-white' : 'bg-neutral-800/60 text-neutral-200'}`} onClick={() => setFollow && setFollow(!follow)} role="menuitemcheckbox" aria-checked={!!follow}>On</button>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-neutral-300 text-[12px] flex items-center gap-1">Scene Start
                        </label>
                        <p className="text-[11px] text-neutral-500 leading-snug">Scene range defines playback start/end boundaries. Playback stops at end unless looping.</p>
                    </div>
                    {/* Scene Settings moved from GlobalPropertiesPanel */}
                    <div className="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                        <h4 className="text-neutral-200 text-[12px] font-semibold">Scene Settings</h4>
                        <div className="grid grid-cols-3 gap-2">
                            <label className="flex flex-col text-[11px] text-neutral-300">Width
                                <input className="number-input w-full" type="number" min={16} max={8192} value={localWidth} onChange={(e) => setLocalWidth(e.target.value)} onBlur={() => commitSceneSetting('width')} onKeyDown={(e) => { if (e.key === 'Enter') { commitSceneSetting('width'); (e.currentTarget as any).blur?.(); } }} />
                            </label>
                            <label className="flex flex-col text-[11px] text-neutral-300">Height
                                <input className="number-input w-full" type="number" min={16} max={8192} value={localHeight} onChange={(e) => setLocalHeight(e.target.value)} onBlur={() => commitSceneSetting('height')} onKeyDown={(e) => { if (e.key === 'Enter') { commitSceneSetting('height'); (e.currentTarget as any).blur?.(); } }} />
                            </label>
                            <label className="flex flex-col text-[11px] text-neutral-300">FPS
                                <input className="number-input w-full" type="number" min={1} max={240} value={localFps} onChange={(e) => setLocalFps(e.target.value)} onBlur={() => commitSceneSetting('fps')} onKeyDown={(e) => { if (e.key === 'Enter') { commitSceneSetting('fps'); (e.currentTarget as any).blur?.(); } }} />
                            </label>
                        </div>
                        <div className='grid grid-cols-2 gap-2'>
                            <label className="flex flex-col text-[11px] text-neutral-300">Scene Start (s)
                                <input aria-label="Scene start (seconds)" className="number-input w-full" type="number" step={0.01} value={playStartText} onChange={(e) => setPlayStartText(e.target.value)} onBlur={() => commitPlay('start')} onKeyDown={(e) => { if (e.key === 'Enter') commitPlay('start'); }} />
                            </label>
                            <label className="flex flex-col text-[11px] text-neutral-300">Scene End (s)
                                <input aria-label="Scene end (seconds)" className="number-input w-full" type="number" step={0.01} value={playEndText} onChange={(e) => setPlayEndText(e.target.value)} onBlur={() => commitPlay('end')} onKeyDown={(e) => { if (e.key === 'Enter') commitPlay('end'); }} />
                            </label>
                        </div>
                    </div>
                    {/* Debug Settings moved */}
                    <div className="flex flex-col gap-2 border-t border-neutral-700 pt-2">
                        <h4 className="text-neutral-200 text-[12px] font-semibold">Debug</h4>
                        <label className="flex items-center gap-2 text-[12px] text-neutral-300">
                            <input type="checkbox" checked={debugSettings.showAnchorPoints} onChange={(e) => setDebugSettings((prev) => ({ ...prev, showAnchorPoints: e.target.checked }))} />
                            Show Anchor Points
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};
