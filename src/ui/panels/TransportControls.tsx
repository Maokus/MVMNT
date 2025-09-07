import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { secondsToBars, secondsToBeatsSelector } from '@state/selectors/timing';

const fmt = (s: number) => {
    const sign = s < 0 ? '-' : '';
    const abs = Math.abs(s);
    const m = Math.floor(abs / 60);
    const sec = Math.floor(abs % 60);
    const ms = Math.floor((abs * 1000) % 1000);
    return `${sign}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const TransportControls: React.FC = () => {
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    const loopEnabled = useTimelineStore((s) => s.transport.loopEnabled);
    const loopStart = useTimelineStore((s) => s.transport.loopStartSec);
    const loopEnd = useTimelineStore((s) => s.transport.loopEndSec);
    const current = useTimelineStore((s) => s.timeline.currentTimeSec);
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineView = useTimelineStore((s) => s.setTimelineView);
    const togglePlay = useTimelineStore((s) => s.togglePlay);
    const scrub = useTimelineStore((s) => s.scrub);
    const setCurrent = useTimelineStore((s) => s.setCurrentTimeSec);
    const setLoopEnabled = useTimelineStore((s) => s.setLoopEnabled);
    const setLoopRange = useTimelineStore((s) => s.setLoopRange);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);
    const rate = useTimelineStore((s) => s.transport.rate);
    const setRate = useTimelineStore((s) => s.setRate);
    // Phase 1: derive beats/bars from the unified selectors
    const beats = useTimelineStore((s) => secondsToBeatsSelector(s, s.timeline.currentTimeSec));
    const bars = useTimelineStore((s) => secondsToBars(s, s.timeline.currentTimeSec));

    return (
        <div className="transport flex items-center gap-2 text-sm">
            <button className="px-2 py-1 border rounded" onClick={() => togglePlay()}>{isPlaying ? 'Pause' : 'Play'}</button>
            <button className="px-2 py-1 border rounded" onClick={() => { setCurrent(view.startSec); }}>Stop</button>
            <div className="flex items-center gap-1">
                <label className="text-[12px] text-neutral-300 flex items-center gap-1">
                    <input type="checkbox" checked={loopEnabled} onChange={(e) => setLoopEnabled(e.target.checked)} /> Loop
                </label>
                <input className="number-input w-[80px]" type="number" step={0.01} value={loopStart ?? ''} placeholder="loop start" onChange={(e) => setLoopRange(e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0), loopEnd)} />
                <span>–</span>
                <input className="number-input w-[80px]" type="number" step={0.01} value={loopEnd ?? ''} placeholder="loop end" onChange={(e) => setLoopRange(loopStart, e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))} />
                <label className="text-[12px] text-neutral-300 flex items-center gap-1 ml-2" title="Quantize to bar boundaries">
                    <input type="checkbox" checked={quantize === 'bar'} onChange={(e) => setQuantize(e.target.checked ? 'bar' : 'off')} /> Quantize: Bar
                </label>
                <label className="text-[12px] text-neutral-300 flex items-center gap-1 ml-2" title="Playback rate (not yet affecting live playback)">
                    Rate
                    <input className="number-input w-[70px]" type="number" step={0.1} min={0.1} value={rate}
                        onChange={(e) => setRate(parseFloat(e.target.value) || 1)} />
                </label>
            </div>
            <div className="flex items-center gap-2">
                <label className="text-[12px] text-neutral-300 flex items-center gap-1">
                    View
                    <input aria-label="View start (seconds)" className="number-input w-[80px]" type="number" step={0.01} value={view.startSec}
                        onChange={(e) => setTimelineView(parseFloat(e.target.value) || 0, view.endSec)} />
                    <span>–</span>
                    <input aria-label="View end (seconds)" className="number-input w-[80px]" type="number" step={0.01} value={view.endSec}
                        onChange={(e) => setTimelineView(view.startSec, parseFloat(e.target.value) || 0)} />
                </label>
            </div>
            <div className="ml-2 text-[12px] text-neutral-400">
                t = {fmt(current)}
                <span className="ml-2">beats: {beats.toFixed(2)}</span>
                <span className="ml-2">bars: {bars.toFixed(2)}</span>
            </div>
            <input type="range" min={view.startSec} max={view.endSec} value={current}
                onChange={(e) => scrub(parseFloat(e.target.value) || 0)} className="flex-1" />
        </div>
    );
};

export default TransportControls;
