import type { PropertyBinding } from '@bindings/property-bindings';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
import { getTempoAlignedFrame } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import type { AudioTrack } from '@audio/audioTypes';
import type { TimelineTrack } from '@state/timelineStore';

type TimelineTrackEntry = TimelineTrack | AudioTrack;

export function resolveTimelineTrackRefValue(
    binding: PropertyBinding | undefined,
    fallback: unknown,
): string | null {
    const coerce = (input: unknown): string | null => {
        if (typeof input === 'string') return input || null;
        if (Array.isArray(input)) {
            for (const entry of input) {
                if (typeof entry === 'string' && entry) {
                    return entry;
                }
            }
        }
        return null;
    };
    if (binding) {
        try {
            const value = binding.getValue();
            const resolved = coerce(value);
            if (resolved) return resolved;
        } catch (error) {
            console.warn('[audioFeatureUtils] failed to read track ref binding', error);
        }
    }
    return coerce(fallback);
}

export function coerceFeatureDescriptor(
    input: AudioFeatureDescriptor | null | undefined,
    fallback: { featureKey: string; smoothing?: number | null },
): AudioFeatureDescriptor {
    return {
        featureKey: input?.featureKey ?? fallback.featureKey,
        calculatorId: input?.calculatorId ?? null,
        bandIndex: input?.bandIndex ?? null,
        channelIndex: input?.channelIndex ?? null,
        smoothing: input?.smoothing ?? fallback.smoothing ?? null,
    };
}

export function resolveFeatureContext(trackId: string | null, featureKey: string | null) {
    if (!trackId || !featureKey) return null;
    const state = useTimelineStore.getState();
    const entry = state.tracks[trackId] as TimelineTrackEntry | undefined;
    if (!entry || entry.type !== 'audio') return null;
    const sourceId = entry.audioSourceId ?? entry.id;
    const cache = state.audioFeatureCaches[sourceId];
    const featureTrack = cache?.featureTracks?.[featureKey];
    if (!featureTrack) return null;
    return { state, track: entry, sourceId, cache, featureTrack } as const;
}

function recordDiagnostics(diagnostics: TempoAlignedAdapterDiagnostics, trackId: string) {
    const state = useTimelineStore.getState();
    state.recordTempoAlignedDiagnostics?.(diagnostics.sourceId ?? trackId, diagnostics);
    if (diagnostics.fallbackReason) {
        state.recordHybridCacheFallback?.({
            trackId,
            sourceId: diagnostics.sourceId ?? trackId,
            featureKey: diagnostics.featureKey,
            reason: diagnostics.fallbackReason,
        });
    }
}

export function sampleFeatureFrame(
    trackId: string,
    descriptor: AudioFeatureDescriptor,
    targetTime: number,
): AudioFeatureFrameSample | null {
    const state = useTimelineStore.getState();
    const tm = getSharedTimingManager();
    const tick = tm.secondsToTicks(Math.max(0, targetTime));
    const { sample, diagnostics } = getTempoAlignedFrame(state, {
        trackId,
        featureKey: descriptor.featureKey,
        tick,
        options: {
            bandIndex: descriptor.bandIndex ?? undefined,
            channelIndex: descriptor.channelIndex ?? undefined,
            smoothing: descriptor.smoothing ?? undefined,
        },
    });
    if (diagnostics) {
        recordDiagnostics(diagnostics, trackId);
    }
    return sample ?? null;
}
