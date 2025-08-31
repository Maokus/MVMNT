import React, { useEffect, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';

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
    const play = useTimelineStore((s) => s.play);
    const pause = useTimelineStore((s) => s.pause);
    const togglePlay = useTimelineStore((s) => s.togglePlay);
    const scrub = useTimelineStore((s) => s.scrub);
    const setCurrent = useTimelineStore((s) => s.setCurrentTimeSec);
    const setLoopEnabled = useTimelineStore((s) => s.setLoopEnabled);
    const setLoopRange = useTimelineStore((s) => s.setLoopRange);

    // simple RAF to advance time when playing; loop when needed
    const rafRef = useRef<number | null>(null);
    const lastTsRef = useRef<number | null>(null);
    useEffect(() => {
        if (!isPlaying) { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; lastTsRef.current = null; return; }
        const tick = (ts: number) => {
            const last = lastTsRef.current;
            lastTsRef.current = ts;
            if (last != null) {
                const dt = (ts - last) / 1000;
                let next = current + dt;
                if (loopEnabled && loopStart != null && loopEnd != null && loopEnd > loopStart) {
                    if (next > loopEnd) next = loopStart + ((next - loopStart) % (loopEnd - loopStart));
                }
                setCurrent(next);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
    }, [isPlaying, loopEnabled, loopStart, loopEnd, current, setCurrent]);

    return (
        <div className="transport flex items-center gap-2 text-sm">
            <button className="px-2 py-1 border rounded" onClick={() => togglePlay()}>{isPlaying ? 'Pause' : 'Play'}</button>
            <button className="px-2 py-1 border rounded" onClick={() => { setCurrent(0); }}>Stop</button>
            <div className="flex items-center gap-1">
                <label className="text-[12px] text-neutral-300 flex items-center gap-1">
                    <input type="checkbox" checked={loopEnabled} onChange={(e) => setLoopEnabled(e.target.checked)} /> Loop
                </label>
                <input className="number-input w-[80px]" type="number" step={0.01} value={loopStart ?? ''} placeholder="loop start" onChange={(e) => setLoopRange(e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0), loopEnd)} />
                <span>–</span>
                <input className="number-input w-[80px]" type="number" step={0.01} value={loopEnd ?? ''} placeholder="loop end" onChange={(e) => setLoopRange(loopStart, e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))} />
            </div>
            <div className="ml-2 text-[12px] text-neutral-400">t = {fmt(current)}</div>
            <input type="range" min={0} max={Math.max(10, loopEnd ?? 10)} value={current} onChange={(e) => scrub(parseFloat(e.target.value) || 0)} className="flex-1" />
        </div>
    );
};

export default TransportControls;
