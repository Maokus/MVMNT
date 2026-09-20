import React from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { formatTickAsBBT } from '@core/timing/time-domain';
import { sharedTimingManager } from '@state/timelineStore';
import { createTimingContext, ticksToSeconds } from '@state/timelineTime';
import { quarterNotesPerBar } from '@core/timing/meter';

// Time indicator component (moved to the left header beside Add MIDI Track)
const TimeIndicator: React.FC = () => {
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const meter = useTimelineStore((s) => s.timeline.timeSignature);
    const tempoMap = useTimelineStore((s) => s.timeline.masterTempoMap);
    const bpm = useTimelineStore((s) => s.timeline.globalBpm);
    // Use TimingManager for canonical ticksPerQuarter instead of hard-coded constant (was 960 vs core 480 mismatch)
    // Use shared timing manager (singleton) for consistent tick domain
    const ticksPerQuarter = sharedTimingManager.ticksPerQuarter;
    // Derive beats/seconds from tick
    const beatsFloat = currentTick / ticksPerQuarter;
    const barsFloat = beatsFloat / quarterNotesPerBar(meter);
    const seconds = ticksToSeconds(
        createTimingContext({
            globalBpm: bpm,
            beatsPerBar: meter.numerator,
            timeSignature: meter,
            masterTempoMap: tempoMap,
        }),
        currentTick
    );
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
            <span>{formatTickAsBBT(currentTick, ticksPerQuarter, meter)}</span>
            <span className="hidden sm:inline">({fmt(seconds)})</span>
            <span className="hidden sm:inline whitespace-nowrap">beats: {beatsFloat.toFixed(2)}</span>
            <span className="hidden sm:inline whitespace-nowrap">bars: {barsFloat.toFixed(2)}</span>
        </div>
    );
};

export default TimeIndicator;
