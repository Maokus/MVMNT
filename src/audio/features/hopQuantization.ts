import type { TempoMapper } from '@core/timing';
import type { AudioFeatureTempoProjection } from './audioFeatureTypes';

function clampHopTicks(value: number | null | undefined): number | null {
    if (typeof value !== 'number') {
        return null;
    }
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    return Math.max(1, Math.round(value));
}

export interface QuantizeHopOptions {
    hopSeconds: number;
    tempoMapper: TempoMapper;
    tempoProjection?: AudioFeatureTempoProjection | null;
}

export function quantizeHopTicks({
    hopSeconds,
    tempoMapper,
    tempoProjection,
}: QuantizeHopOptions): number {
    const projected = clampHopTicks(tempoProjection?.hopTicks);
    if (projected != null) {
        return projected;
    }
    if (Number.isFinite(hopSeconds) && hopSeconds > 0) {
        const mapped = tempoMapper.secondsToTicks(hopSeconds);
        const clamped = clampHopTicks(mapped);
        if (clamped != null) {
            return clamped;
        }
    }
    return 1;
}

export function normalizeHopTicks(value: number | null | undefined): number | null {
    return clampHopTicks(value);
}
