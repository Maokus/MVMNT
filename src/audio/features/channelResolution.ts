import type { AudioFeatureTrack } from './audioFeatureTypes';

export interface TrackChannelConfig {
    track?: Pick<AudioFeatureTrack, 'channelAliases' | 'channels'> | null;
    cacheAliases?: string[] | null;
}

function clampChannel(index: number, channelCount: number | null | undefined): number {
    if (channelCount == null || Number.isNaN(channelCount) || channelCount <= 0) {
        return Math.max(0, index);
    }
    if (index < 0 || index >= channelCount) {
        throw new Error(
            `[channelResolution] Channel index ${index} is out of range for track with ${channelCount} channel$${
                channelCount === 1 ? '' : 's'
            }.`,
        );
    }
    return index;
}

function tryResolveFromAliases(value: string, aliases?: (string | null | undefined)[] | null): number | null {
    if (!aliases || !aliases.length) {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    for (let index = 0; index < aliases.length; index += 1) {
        const alias = aliases[index];
        if (typeof alias !== 'string') continue;
        if (alias.trim().toLowerCase() === normalized) {
            return index;
        }
    }
    return null;
}

const WELL_KNOWN_ALIASES: Record<string, number> = {
    mono: 0,
    mid: 0,
    middle: 0,
    center: 0,
    centre: 0,
    l: 0,
    left: 0,
    r: 1,
    right: 1,
    side: 1,
    stereo: 0,
    bass: 0,
    low: 0,
    high: 1,
};

export function resolveChannel(
    channel: number | string | null | undefined,
    trackConfig: TrackChannelConfig,
): number {
    const channelCount = trackConfig.track?.channels ?? null;
    if (typeof channel === 'number' && Number.isFinite(channel)) {
        return clampChannel(Math.trunc(channel), channelCount);
    }
    if (channel == null) {
        return 0;
    }
    if (typeof channel === 'string') {
        const trimmed = channel.trim();
        if (!trimmed) {
            return 0;
        }
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric) && trimmed === `${numeric}`) {
            return clampChannel(Math.trunc(numeric), channelCount);
        }
        const normalized = trimmed.toLowerCase();
        const fromTrackAliases = tryResolveFromAliases(normalized, trackConfig.track?.channelAliases ?? null);
        if (fromTrackAliases != null) {
            return clampChannel(fromTrackAliases, channelCount);
        }
        const fromCacheAliases = tryResolveFromAliases(normalized, trackConfig.cacheAliases ?? null);
        if (fromCacheAliases != null) {
            return clampChannel(fromCacheAliases, channelCount);
        }
        const fallback = WELL_KNOWN_ALIASES[normalized];
        if (fallback != null) {
            if (channelCount != null && channelCount <= fallback) {
                throw new Error(
                    `[channelResolution] Alias \"${channel}\" resolves to channel ${fallback}, but the track only exposes ${channelCount} channel$${
                        channelCount === 1 ? '' : 's'
                    }.`,
                );
            }
            return fallback;
        }
        throw new Error(
            `[channelResolution] Unknown channel alias \"${channel}\". Available aliases: ${[
                ...((trackConfig.track?.channelAliases ?? []) as string[]),
                ...((trackConfig.cacheAliases ?? []) as string[]),
            ]
                .filter(Boolean)
                .join(', ') || 'none'}.`,
        );
    }
    throw new Error(`[channelResolution] Unsupported channel value: ${String(channel)}`);
}
