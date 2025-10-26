import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function migrateDescriptorChannels(descriptor: unknown): AudioFeatureDescriptor | null {
    if (!descriptor || typeof descriptor !== 'object') {
        return null;
    }
    const source = descriptor as Record<string, unknown>;
    const featureKey = typeof source.featureKey === 'string' ? source.featureKey : null;
    if (!featureKey) {
        return null;
    }
    const calculatorId = typeof source.calculatorId === 'string' ? source.calculatorId : null;
    const bandIndex = isFiniteNumber(source.bandIndex) ? Math.trunc(source.bandIndex as number) : null;

    const migrated: AudioFeatureDescriptor = {
        featureKey,
        calculatorId,
        bandIndex,
    };

    for (const [key, value] of Object.entries(source)) {
        if (key === 'featureKey' || key === 'calculatorId' || key === 'bandIndex' || key === 'smoothing') continue;
        if (key === 'channelIndex' || key === 'channelAlias' || key === 'channel') continue;
        (migrated as unknown as Record<string, unknown>)[key] = value;
    }

    return migrated;
}
