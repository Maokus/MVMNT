import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface ChannelRange {
    autoRange: boolean;
    manualMin: number;
    manualMax: number;
}

interface CurveRangeCtx {
    getRange: (channelId: string) => ChannelRange;
    setAutoRange: (channelId: string, auto: boolean) => void;
    setManualRange: (channelId: string, min: number, max: number) => void;
    /** Ref map so the curve pane can expose its current animated values for seeding manual mode */
    displayedRefs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
}

const DEFAULT_RANGE: ChannelRange = { autoRange: true, manualMin: 0, manualMax: 1 };

const CurveRangeContext = createContext<CurveRangeCtx>({
    getRange: () => DEFAULT_RANGE,
    setAutoRange: () => { },
    setManualRange: () => { },
    displayedRefs: { current: {} },
});

export function CurveRangeProvider({ children }: { children: React.ReactNode }) {
    const [ranges, setRanges] = useState<Record<string, ChannelRange>>({});
    const displayedRefs = useRef<Record<string, { min: number; max: number }>>({});

    const getRange = useCallback(
        (channelId: string): ChannelRange => ranges[channelId] ?? DEFAULT_RANGE,
        [ranges],
    );

    const setAutoRange = useCallback((channelId: string, auto: boolean) => {
        setRanges((prev) => ({
            ...prev,
            [channelId]: { ...(prev[channelId] ?? DEFAULT_RANGE), autoRange: auto },
        }));
    }, []);

    const setManualRange = useCallback((channelId: string, min: number, max: number) => {
        setRanges((prev) => ({
            ...prev,
            [channelId]: { autoRange: false, manualMin: min, manualMax: max },
        }));
    }, []);

    return (
        <CurveRangeContext.Provider value={{ getRange, setAutoRange, setManualRange, displayedRefs }}>
            {children}
        </CurveRangeContext.Provider>
    );
}

export function useCurveRange(channelId: string): ChannelRange {
    const { getRange } = useContext(CurveRangeContext);
    return getRange(channelId);
}

export function useCurveRangeControls() {
    const { setAutoRange, setManualRange, displayedRefs } = useContext(CurveRangeContext);
    return { setAutoRange, setManualRange, displayedRefs };
}
