import React, { useMemo } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from '../hooks/useTickScale';
import { getAdaptiveGridSubdivisions, quantizeSettingToBeats } from '@state/timeline/quantize';

type Props = {
    width: number;
    height: number;
    startTick: number;
    endTick: number;
};

type GridLevel = 'bar' | 'beat' | 'eighth' | 'sixteenth' | 'snap';

const COLOR: Record<GridLevel, string> = {
    bar: 'rgba(255,255,255,0.25)',
    beat: 'rgba(255,255,255,0.08)',
    eighth: 'rgba(255,255,255,0.05)',
    sixteenth: 'rgba(255,255,255,0.03)',
    snap: 'rgba(255,255,255,0.06)',
};

const GridLines: React.FC<Props> = ({ width, height, startTick, endTick }) => {
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const adaptiveSnap = useTimelineStore((s) => s.transport.adaptiveSnap);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const arbitrarySnapN = useTimelineStore((s) => s.transport.arbitrarySnapN);
    const ppq = CANONICAL_PPQ;
    const { toX } = useTickScale();
    const ticksPerBar = bpb * ppq;

    const lines = useMemo(() => {
        const arr: Array<{ tick: number; level: GridLevel }> = [];
        const firstBar = Math.max(0, Math.floor(startTick / ticksPerBar) - 1);
        const lastBar = Math.floor(endTick / ticksPerBar) + 1;

        if (adaptiveSnap) {
            // Adaptive mode: multi-level hierarchical grid based on zoom
            const { showBeats, showEighths, showSixteenths } = getAdaptiveGridSubdivisions(
                width, endTick - startTick, bpb, ppq
            );
            for (let bar = firstBar; bar <= lastBar; bar++) {
                for (let beat = 0; beat < bpb; beat++) {
                    const beatTick = bar * ticksPerBar + beat * ppq;
                    const subdivisions = showSixteenths ? 4 : showEighths ? 2 : 1;
                    for (let sub = 0; sub < subdivisions; sub++) {
                        const tick = beatTick + sub * (ppq / subdivisions);
                        if (tick < startTick - ppq || tick > endTick + ppq) continue;
                        let level: GridLevel;
                        if (beat === 0 && sub === 0) level = 'bar';
                        else if (sub === 0) level = 'beat';
                        else if (subdivisions === 4 && sub === 2) level = 'eighth';
                        else level = 'sixteenth';
                        if (level === 'beat' && !showBeats) continue;
                        arr.push({ tick, level });
                    }
                }
            }
            return arr;
        }

        // Fixed snap mode: bar lines + snap interval lines
        const barTicks = new Set<number>();
        for (let bar = firstBar; bar <= lastBar; bar++) {
            const tick = bar * ticksPerBar;
            if (tick < startTick - ppq || tick > endTick + ppq) continue;
            barTicks.add(tick);
            arr.push({ tick, level: 'bar' });
        }

        if (quantize !== 'off') {
            const beatLen = quantizeSettingToBeats(quantize, bpb, arbitrarySnapN);
            if (beatLen && beatLen > 0) {
                const snapIntervalTicks = Math.max(1, Math.round(beatLen * ppq));
                const firstSnap = Math.floor(startTick / snapIntervalTicks) - 1;
                const lastSnap = Math.ceil(endTick / snapIntervalTicks) + 1;
                const TOLERANCE = 2;
                for (let i = firstSnap; i <= lastSnap; i++) {
                    const tick = i * snapIntervalTicks;
                    if (tick < 0 || tick < startTick - ppq || tick > endTick + ppq) continue;
                    // Skip if coincides with a bar line
                    if ([...barTicks].some((bt) => Math.abs(tick - bt) <= TOLERANCE)) continue;
                    arr.push({ tick, level: 'snap' });
                }
            }
        }

        return arr;
    }, [startTick, endTick, ticksPerBar, bpb, ppq, width, adaptiveSnap, quantize, arbitrarySnapN]);

    return (
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden>
            {lines.map((g, i) => {
                const x = toX(g.tick, width);
                return <line key={i} x1={x} x2={x} y1={0} y2={height} stroke={COLOR[g.level]} strokeWidth={1} />;
            })}
        </svg>
    );
};

export default GridLines;
