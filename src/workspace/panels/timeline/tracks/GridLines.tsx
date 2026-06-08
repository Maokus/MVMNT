import React, { useMemo } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from '../hooks/useTickScale';
import { getAdaptiveGridSubdivisions } from '@state/timeline/quantize';

type Props = {
    width: number;
    height: number;
    startTick: number;
    endTick: number;
};

type GridLevel = 'bar' | 'beat' | 'eighth' | 'sixteenth';

const COLOR: Record<GridLevel, string> = {
    bar: 'rgba(255,255,255,0.25)',
    beat: 'rgba(255,255,255,0.08)',
    eighth: 'rgba(255,255,255,0.05)',
    sixteenth: 'rgba(255,255,255,0.03)',
};

const GridLines: React.FC<Props> = ({ width, height, startTick, endTick }) => {
    const bpb = useTimelineStore((s) => s.timeline.beatsPerBar || 4);
    const adaptiveSnap = useTimelineStore((s) => s.transport.adaptiveSnap);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const ppq = CANONICAL_PPQ;
    const { toX } = useTickScale();
    const ticksPerBar = bpb * ppq;

    const { showBeats, showEighths, showSixteenths } = useMemo(() => {
        if (adaptiveSnap) {
            return getAdaptiveGridSubdivisions(width, endTick - startTick, bpb, ppq);
        }
        const q = quantize === 'off' ? 'quarter' : quantize;
        return {
            showBeats: q === 'quarter' || q === 'eighth' || q === 'sixteenth' || q === 'thirty-second',
            showEighths: q === 'eighth' || q === 'sixteenth' || q === 'thirty-second',
            showSixteenths: q === 'sixteenth' || q === 'thirty-second',
        };
    }, [adaptiveSnap, quantize, width, startTick, endTick, bpb, ppq]);

    const lines = useMemo(() => {
        const firstBar = Math.max(0, Math.floor(startTick / ticksPerBar) - 1);
        const lastBar = Math.floor(endTick / ticksPerBar) + 1;
        const arr: Array<{ tick: number; level: GridLevel }> = [];

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
    }, [startTick, endTick, ticksPerBar, bpb, ppq, showBeats, showEighths, showSixteenths]);

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
