import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    clearFeatureData,
    getFeatureData,
    type FeatureDataResult,
    type FeatureInput,
    type SceneFeatureElementRef,
} from './sceneApi';
import type { AudioSamplingOptions } from './audioFeatureTypes';

interface HookState {
    element: SceneFeatureElementRef;
    lastResult: FeatureDataResult | null;
}

let elementSequence = 0;

function createElementRef(): SceneFeatureElementRef {
    elementSequence += 1;
    return {
        id: `react:audioFeature:${elementSequence}`,
        type: 'reactAudioFeature',
    };
}

function normalizeTrackId(trackId: string | null | undefined): string | null {
    if (typeof trackId !== 'string') return null;
    const trimmed = trackId.trim();
    return trimmed.length ? trimmed : null;
}

function stableSerialize(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, val]) => [key, stableSerialize(val)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${val}`).join(',')}}`;
}

export interface UseAudioFeatureResult {
    getData: (time: number) => FeatureDataResult | null;
    isLoading: boolean;
}

export function useAudioFeature(
    trackId: string | null | undefined,
    feature: FeatureInput,
    samplingOptions?: AudioSamplingOptions | null,
): UseAudioFeatureResult {
    const stateRef = useRef<HookState | null>(null);
    if (!stateRef.current) {
        stateRef.current = { element: createElementRef(), lastResult: null };
    }

    const normalizedTrackId = normalizeTrackId(trackId);
    const featureKey = useMemo(() => stableSerialize(feature), [feature]);
    const samplingKey = useMemo(() => stableSerialize(samplingOptions ?? null), [samplingOptions]);

    useEffect(() => {
        stateRef.current!.lastResult = null;
    }, [normalizedTrackId, featureKey, samplingKey]);

    useEffect(() => () => {
        if (stateRef.current) {
            clearFeatureData(stateRef.current.element);
        }
    }, []);

    const getData = useCallback(
        (time: number) => {
            if (!stateRef.current) {
                return null;
            }
            const elementRef = stateRef.current.element;
            if (!normalizedTrackId) {
                clearFeatureData(elementRef);
                stateRef.current.lastResult = null;
                return null;
            }
            const result = getFeatureData(
                elementRef,
                normalizedTrackId,
                feature,
                time,
                samplingOptions ?? undefined,
            );
            if (result) {
                stateRef.current.lastResult = result;
            }
            return result;
        },
        [normalizedTrackId, feature, samplingOptions],
    );

    const isLoading = Boolean(normalizedTrackId) && stateRef.current?.lastResult == null;

    return { getData, isLoading };
}
