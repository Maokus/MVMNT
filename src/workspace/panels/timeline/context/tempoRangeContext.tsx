import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { TempoKeyframe } from '@core/timing/types';
import { useTimelineStore } from '@state/timelineStore';

export interface TempoRange {
    min: number;
    max: number;
}

const DEFAULT_RANGE: TempoRange = { min: 60, max: 180 };
const MIN_SPAN = 20;

export function fitTempoRange(keyframes: TempoKeyframe[]): TempoRange {
    if (!keyframes.length) return DEFAULT_RANGE;
    const values = keyframes.map((keyframe) => keyframe.bpm);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max(10, (high - low) * 0.2);
    return { min: Math.floor(low - padding), max: Math.ceil(high + padding) };
}

export function isValidTempoRange(range: TempoRange): boolean {
    return Number.isFinite(range.min) && Number.isFinite(range.max) && range.max - range.min >= MIN_SPAN;
}

interface TempoRangeContextValue {
    autoRange: boolean;
    range: TempoRange;
    setAutoRange: (auto: boolean) => void;
    setManualRange: (range: TempoRange) => boolean;
    panByWheel: (deltaY: number) => void;
}

const TempoRangeContext = createContext<TempoRangeContextValue | null>(null);

export function TempoRangeProvider({ children }: { children: React.ReactNode }) {
    const keyframes = useTimelineStore((state) => state.timeline.tempoAutomation?.keyframes);
    const fittedRange = useMemo(() => fitTempoRange(keyframes ?? []), [keyframes]);
    const [autoRange, setAutoRange] = useState(true);
    const [manualRange, setManualRangeState] = useState<TempoRange>(DEFAULT_RANGE);
    const range = autoRange ? fittedRange : manualRange;
    const rangeRef = useRef(range);
    rangeRef.current = range;

    const setManualRange = useCallback((next: TempoRange) => {
        if (!isValidTempoRange(next)) return false;
        rangeRef.current = next;
        setManualRangeState(next);
        setAutoRange(false);
        return true;
    }, []);

    const panByWheel = useCallback(
        (deltaY: number) => {
            if (!Number.isFinite(deltaY) || deltaY === 0) return;
            const current = rangeRef.current;
            const shift = (deltaY / 100) * (current.max - current.min) * 0.3;
            setManualRange({ min: current.min + shift, max: current.max + shift });
        },
        [setManualRange]
    );

    return (
        <TempoRangeContext.Provider value={{ autoRange, range, setAutoRange, setManualRange, panByWheel }}>
            {children}
        </TempoRangeContext.Provider>
    );
}

export function useTempoRange(): TempoRangeContextValue {
    const context = useContext(TempoRangeContext);
    if (!context) throw new Error('Tempo range controls require TempoRangeProvider');
    return context;
}
