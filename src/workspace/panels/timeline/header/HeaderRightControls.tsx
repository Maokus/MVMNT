import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { sharedTimingManager } from '@state/timelineStore';
import { FaMagnet, FaEllipsisV, FaExpand, FaObjectGroup, FaCrosshairs, FaArrowRight, FaMagic } from 'react-icons/fa';
import {
    formatQuantizeLabel,
    TIMELINE_SNAP_OPTIONS,
    type QuantizeSetting,
    type SnapQuantizeOption,
} from '@state/timeline/quantize';

// --- Timeline navigation helpers ---
const MIN_RANGE = 4; // 4 ticks (~1/120 beat at PPQ=480)
const MAX_RANGE = CANONICAL_PPQ * 60 * 10;

// Right-side header controls: zoom slider, view presets, quantize toggle, follow
const HeaderRightControls: React.FC<{
    follow?: boolean;
    setFollow?: (v: boolean) => void;
    onFitAll?: () => void;
    onZoomToSelection?: () => void;
    onCenterOnPlayhead?: () => void;
}> = ({ follow, setFollow, onFitAll, onZoomToSelection, onCenterOnPlayhead }) => {
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);
    const adaptiveSnap = useTimelineStore((s) => s.transport.adaptiveSnap);
    const setAdaptiveSnap = useTimelineStore((s) => s.setAdaptiveSnap);
    const lastNonOffQuantizeRef = useRef<QuantizeSetting>('bar');
    useEffect(() => {
        if (quantize !== 'off') {
            lastNonOffQuantizeRef.current = quantize;
        }
    }, [quantize]);
    const magnetActive = quantize !== 'off';
    const currentQuantizeLabel = formatQuantizeLabel(quantize);
    const pendingQuantizeLabel = formatQuantizeLabel(lastNonOffQuantizeRef.current);
    const snapSelectValue = (magnetActive ? quantize : lastNonOffQuantizeRef.current) as SnapQuantizeOption;
    // Global timing state
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const setGlobalBpm = useTimelineStore((s) => s.setGlobalBpm);
    const setBeatsPerBar = useTimelineStore((s) => s.setBeatsPerBar);
    const tempoAutomationEnabled = useTimelineStore((s) => !!s.timeline.tempoAutomation?.enabled);
    // When tempo automation is enabled, derive the instantaneous BPM at the playhead
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const displayBpm = useMemo(() => {
        if (!tempoAutomationEnabled) return globalBpm;
        try {
            const tm = sharedTimingManager;
            if (!tm) return globalBpm;
            const sec = tm.ticksToSeconds(currentTick);
            const spb = tm.getSecondsPerBeat(sec);
            if (spb > 0) return Math.round(60 / spb * 10) / 10;
        } catch { }
        return globalBpm;
    }, [tempoAutomationEnabled, currentTick, globalBpm]);
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
    useEffect(() => {
        const v = tempoAutomationEnabled ? displayBpm : globalBpm;
        setLocalTempo(String(Number.isFinite(v) ? v : 120));
    }, [globalBpm, tempoAutomationEnabled, displayBpm]);
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
                <label className="flex items-center gap-1 text-neutral-300" title={tempoAutomationEnabled ? 'Tempo is automated — edit keyframes in the tempo lane' : 'Global tempo (BPM)'}>
                    <span>BPM</span>
                    <input
                        aria-label="Global tempo (BPM)"
                        className={`number-input w-[70px] ${tempoAutomationEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        type="number"
                        min={1}
                        max={400}
                        step={0.1}
                        value={localTempo}
                        onChange={(e) => !tempoAutomationEnabled && setLocalTempo(e.target.value)}
                        onBlur={() => !tempoAutomationEnabled && commitTempo()}
                        onKeyDown={(e) => { if (!tempoAutomationEnabled && e.key === 'Enter') { commitTempo(); (e.currentTarget as any).blur?.(); } }}
                        disabled={tempoAutomationEnabled}
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
            {/* Snap group: three-segment pill — [magnet | snap denominator | adaptive] */}
            <div className="flex items-stretch rounded-md border border-neutral-700 overflow-hidden text-[11px]">
                {/* Segment 1: Snap enable toggle */}
                <button
                    aria-label={
                        magnetActive
                            ? `Disable snapping (${currentQuantizeLabel})`
                            : `Enable snapping (${pendingQuantizeLabel})`
                    }
                    title={
                        magnetActive
                            ? `Snapping: ${currentQuantizeLabel} — click or press S to turn off`
                            : `Snapping off — click or press S to turn on (${pendingQuantizeLabel})`
                    }
                    onClick={() => setQuantize(magnetActive ? 'off' : lastNonOffQuantizeRef.current)}
                    className={`px-2 py-1 flex items-center justify-center transition-colors ${magnetActive
                        ? 'bg-blue-600/70 text-white'
                        : 'bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                        }`}
                >
                    <FaMagnet />
                </button>
                {/* Divider */}
                <div className="w-px bg-neutral-700 self-stretch" />
                {/* Segment 2: Snap denominator select */}
                <select
                    aria-label="Snap quantize"
                    disabled={adaptiveSnap}
                    className={`bg-neutral-900/60 px-1 py-[3px] cursor-pointer focus:outline-none transition-colors border-0 ${adaptiveSnap
                        ? 'text-neutral-600 cursor-not-allowed opacity-50'
                        : magnetActive
                            ? 'text-white'
                            : 'text-neutral-400'
                        }`}
                    value={snapSelectValue}
                    onChange={(e) => setQuantize(e.target.value as SnapQuantizeOption)}
                >
                    {TIMELINE_SNAP_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.shortLabel}
                        </option>
                    ))}
                </select>
                {/* Divider */}
                <div className="w-px bg-neutral-700 self-stretch" />
                {/* Segment 3: Adaptive snap toggle */}
                <button
                    aria-label={adaptiveSnap ? 'Adaptive snapping: on — click to use fixed snap' : 'Adaptive snapping: off — click to enable zoom-aware snap'}
                    title={adaptiveSnap ? 'Adaptive snapping on — snap denominator adjusts with zoom' : 'Adaptive snapping off — click to enable zoom-aware snapping'}
                    onClick={() => setAdaptiveSnap(!adaptiveSnap)}
                    className={`px-2 py-1 flex items-center justify-center transition-colors ${adaptiveSnap
                        ? 'bg-blue-600/70 text-white'
                        : 'bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                        }`}
                >
                    <FaMagic />
                </button>
            </div>
            {/* Auto-follow playhead button */}
            <button
                aria-label={follow ? 'Auto follow playhead: on' : 'Auto follow playhead: off'}
                title={follow ? 'Auto follow playhead: on (click to disable)' : 'Auto follow playhead: off (click to enable)'}
                onClick={() => setFollow && setFollow(!follow)}
                className={`px-2 py-1 rounded border border-neutral-700 flex items-center justify-center transition-colors ${follow
                    ? 'bg-blue-600/70 text-white border-blue-400/70'
                    : 'bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800/60'
                    }`}
            >
                <FaArrowRight />
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
                                    'w-64 rounded border border-border bg-panel/95 p-3 shadow-lg shadow-black/40 flex flex-col gap-3 text-neutral-200 backdrop-blur-sm z-[1000] text-xs',
                            })}
                            ref={menuRefs.setFloating}
                            style={menuFloatingStyles}
                        >
                            {/* Zoom slider */}
                            <label className="text-neutral-300 flex items-center gap-2" title="Adjust timeline zoom">
                                <span>Zoom</span>
                                <input aria-label="Timeline zoom" className="flex-1" type="range" min={0} max={100} step={1} value={zoomVal} onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setZoomVal(v);
                                    const newRange = rangeFromSlider(v);
                                    const center = (view.startTick + view.endTick) / 2;
                                    const newStart = Math.round(center - newRange / 2);
                                    const newEnd = Math.round(newStart + newRange);
                                    setTimelineViewTicks(newStart, newEnd);
                                }} />
                            </label>
                            {/* View preset buttons */}
                            <div className="flex items-center gap-1" role="none">
                                <button
                                    className="flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1"
                                    title="Fit all content (Shift+1)"
                                    onClick={() => { onFitAll?.(); setMenuOpen(false); }}
                                >
                                    <FaExpand className="text-neutral-300" />
                                </button>
                                <button
                                    className="flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1"
                                    title="Zoom to selection (Shift+2)"
                                    onClick={() => { onZoomToSelection?.(); setMenuOpen(false); }}
                                >
                                    <FaObjectGroup className="text-neutral-300" />
                                </button>
                                <button
                                    className="flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1"
                                    title="Center on playhead (F)"
                                    onClick={() => { onCenterOnPlayhead?.(); setMenuOpen(false); }}
                                >
                                    <FaCrosshairs className="text-neutral-300" />
                                </button>
                            </div>
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </div>
    );
};

export default HeaderRightControls;
