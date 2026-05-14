import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { formatTickAsBBT } from '@core/timing/time-domain';
import { sharedTimingManager } from '@state/timelineStore';

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

export default TimeIndicator;
