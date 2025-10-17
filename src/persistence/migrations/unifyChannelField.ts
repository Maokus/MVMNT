import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function pickChannelValue(source: any): number | string | null {
    if (source == null || typeof source !== 'object') {
        return null;
    }
    if (source.channel != null) {
        if (typeof source.channel === 'string') {
            const trimmed = source.channel.trim();
            return trimmed.length > 0 && trimmed.toLowerCase() !== 'auto' ? trimmed : null;
        }
        if (isFiniteNumber(source.channel)) {
            return Math.trunc(source.channel);
        }
    }
    const alias = typeof source.channelAlias === 'string' ? source.channelAlias.trim() : '';
    if (alias.length > 0 && alias.toLowerCase() !== 'auto') {
        return alias;
    }
    if (isFiniteNumber(source.channelIndex)) {
        return Math.trunc(source.channelIndex);
    }
    return null;
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
    const smoothing = isFiniteNumber(source.smoothing) ? (source.smoothing as number) : null;
    const channel = pickChannelValue(source);

    const migrated: AudioFeatureDescriptor = {
        featureKey,
        calculatorId,
        bandIndex,
        smoothing,
        channel: channel ?? null,
    };

    for (const [key, value] of Object.entries(source)) {
        if (key === 'featureKey' || key === 'calculatorId' || key === 'bandIndex' || key === 'smoothing') continue;
        if (key === 'channelIndex' || key === 'channelAlias' || key === 'channel') continue;
        (migrated as unknown as Record<string, unknown>)[key] = value;
    }

    return migrated;
}
