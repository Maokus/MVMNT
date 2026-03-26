import React, { createContext, useCallback, useContext, useState } from 'react';
import { CURVE_EDITOR_HEIGHT } from './constants';

interface CurveHeightCtx {
    getHeight: (channelId: string) => number;
    setHeight: (channelId: string, height: number) => void;
}

const CurveHeightContext = createContext<CurveHeightCtx>({
    getHeight: () => CURVE_EDITOR_HEIGHT,
    setHeight: () => { },
});

export function CurveHeightProvider({ children }: { children: React.ReactNode }) {
    const [heights, setHeights] = useState<Record<string, number>>({});

    const getHeight = useCallback(
        (channelId: string) => heights[channelId] ?? CURVE_EDITOR_HEIGHT,
        [heights],
    );

    const setHeight = useCallback((channelId: string, height: number) => {
        setHeights((prev) => ({ ...prev, [channelId]: Math.max(60, Math.min(400, height)) }));
    }, []);

    return (
        <CurveHeightContext.Provider value={{ getHeight, setHeight }}>
            {children}
        </CurveHeightContext.Provider>
    );
}

export function useCurveHeight(channelId: string): number {
    const { getHeight } = useContext(CurveHeightContext);
    return getHeight(channelId);
}

export function useCurveHeightSetter(): (channelId: string, height: number) => void {
    const { setHeight } = useContext(CurveHeightContext);
    return setHeight;
}
