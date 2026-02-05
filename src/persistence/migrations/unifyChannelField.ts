import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { buildDescriptorId } from '@audio/features/analysisIntents';

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export interface MigratedDescriptorChannelSelector {
    alias?: string | null;
    index?: number | null;
}

export interface MigratedDescriptorChannelsResult {
    descriptor: AudioFeatureDescriptor | null;
    channelSelector: MigratedDescriptorChannelSelector | null;
}

export function migrateDescriptorChannels(descriptor: unknown): MigratedDescriptorChannelsResult {
    if (!descriptor || typeof descriptor !== 'object') {
        return { descriptor: null, channelSelector: null };
    }
    const source = descriptor as Record<string, unknown>;
    const featureKey = typeof source.featureKey === 'string' ? source.featureKey : null;
    if (!featureKey) {
        return { descriptor: null, channelSelector: null };
    }
    const calculatorId = typeof source.calculatorId === 'string' ? source.calculatorId : null;
    const bandIndex = isFiniteNumber(source.bandIndex) ? Math.trunc(source.bandIndex as number) : null;

    let channelAlias: string | null = null;
    let channelIndex: number | null = null;
    if (typeof source.channelAlias === 'string' && source.channelAlias.trim()) {
        channelAlias = source.channelAlias.trim();
    }
    if (isFiniteNumber(source.channelIndex)) {
        channelIndex = Math.trunc(source.channelIndex as number);
    }
    const rawChannel = source.channel;
    if (typeof rawChannel === 'string' && !channelAlias && rawChannel.trim()) {
        channelAlias = rawChannel.trim();
    } else if (isFiniteNumber(rawChannel) && channelIndex == null) {
        channelIndex = Math.trunc(rawChannel as number);
    } else if (rawChannel && typeof rawChannel === 'object') {
        const candidate = rawChannel as { alias?: unknown; index?: unknown };
        if (typeof candidate.alias === 'string' && !channelAlias && candidate.alias.trim()) {
            channelAlias = candidate.alias.trim();
        }
        if (isFiniteNumber(candidate.index) && channelIndex == null) {
            channelIndex = Math.trunc(candidate.index as number);
        }
    }

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

    const selector: MigratedDescriptorChannelSelector = {};
    if (channelAlias) {
        selector.alias = channelAlias;
    }
    if (channelIndex != null) {
        selector.index = channelIndex;
    }
    const hasSelector = selector.alias != null || selector.index != null;
    return { descriptor: migrated, channelSelector: hasSelector ? selector : null };
}

export function buildChannelSelectorMap(
    results: MigratedDescriptorChannelsResult[],
): Record<string, MigratedDescriptorChannelSelector> {
    const map: Record<string, MigratedDescriptorChannelSelector> = {};
    for (const entry of results) {
        if (!entry.descriptor || !entry.channelSelector) {
            continue;
        }
        const id = buildDescriptorId(entry.descriptor);
        map[id] = entry.channelSelector;
    }
    return map;
}
