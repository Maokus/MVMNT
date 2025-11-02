import type { AudioFeatureCache, AudioFeatureTrack } from './audioFeatureTypes';

export const DEFAULT_ANALYSIS_PROFILE_ID = 'default';
const FEATURE_TRACK_KEY_SEPARATOR = ':';

export function sanitizeAnalysisProfileId(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

export function buildFeatureTrackKey(featureKey: string, analysisProfileId: string | null | undefined): string {
    const normalizedFeature = typeof featureKey === 'string' ? featureKey.trim() : '';
    const resolvedFeature = normalizedFeature.length ? normalizedFeature : 'unknown';
    const sanitizedProfile = sanitizeAnalysisProfileId(analysisProfileId) ?? DEFAULT_ANALYSIS_PROFILE_ID;
    return `${resolvedFeature}${FEATURE_TRACK_KEY_SEPARATOR}${sanitizedProfile}`;
}

export function parseFeatureTrackKey(key: string | null | undefined): {
    featureKey: string;
    analysisProfileId: string;
} {
    if (typeof key !== 'string') {
        return { featureKey: '', analysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID };
    }
    const trimmed = key.trim();
    if (!trimmed.length) {
        return { featureKey: '', analysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID };
    }
    const separatorIndex = trimmed.lastIndexOf(FEATURE_TRACK_KEY_SEPARATOR);
    if (separatorIndex <= 0) {
        return { featureKey: trimmed, analysisProfileId: DEFAULT_ANALYSIS_PROFILE_ID };
    }
    const featurePart = trimmed.slice(0, separatorIndex).trim();
    const profilePart = trimmed.slice(separatorIndex + 1);
    const sanitizedProfile = sanitizeAnalysisProfileId(profilePart) ?? DEFAULT_ANALYSIS_PROFILE_ID;
    const resolvedFeature = featurePart.length ? featurePart : trimmed;
    return { featureKey: resolvedFeature, analysisProfileId: sanitizedProfile };
}

export function normalizeFeatureTrackEntry<T extends AudioFeatureTrack>(
    entryKey: string,
    track: T,
    fallbackProfileId?: string | null
): { key: string; track: T } {
    const entryIdentity = parseFeatureTrackKey(entryKey);
    const trackIdentity = parseFeatureTrackKey(track?.key);
    const baseFeatureKey = trackIdentity.featureKey || entryIdentity.featureKey || entryKey.trim();
    const resolvedProfileId =
        sanitizeAnalysisProfileId(track.analysisProfileId) ??
        trackIdentity.analysisProfileId ??
        entryIdentity.analysisProfileId ??
        sanitizeAnalysisProfileId(fallbackProfileId) ??
        DEFAULT_ANALYSIS_PROFILE_ID;
    const compositeKey = buildFeatureTrackKey(baseFeatureKey, resolvedProfileId);
    const normalizedTrack =
        track.key === compositeKey && track.analysisProfileId === resolvedProfileId
            ? track
            : ({ ...track, key: compositeKey, analysisProfileId: resolvedProfileId } as T);
    return { key: compositeKey, track: normalizedTrack };
}

export function normalizeFeatureTrackMap(
    tracks: Record<string, AudioFeatureTrack> | undefined,
    fallbackProfileId?: string | null
): Record<string, AudioFeatureTrack> {
    if (!tracks) {
        return {};
    }
    const normalized: Record<string, AudioFeatureTrack> = {};
    for (const [key, track] of Object.entries(tracks)) {
        if (!track) {
            continue;
        }
        const { key: compositeKey, track: normalizedTrack } = normalizeFeatureTrackEntry(key, track, fallbackProfileId);
        normalized[compositeKey] = normalizedTrack;
    }
    return normalized;
}

export interface ResolveFeatureTrackOptions {
    analysisProfileId?: string | null;
    fallbackProfileId?: string | null;
}

export function resolveFeatureTrackFromCache(
    cache: Pick<AudioFeatureCache, 'featureTracks' | 'defaultAnalysisProfileId'> | undefined,
    featureKey: string | null | undefined,
    options: ResolveFeatureTrackOptions = {}
): { key: string | null; track: AudioFeatureTrack | undefined } {
    if (!cache?.featureTracks) {
        return { key: null, track: undefined };
    }
    if (typeof featureKey !== 'string') {
        return { key: null, track: undefined };
    }
    const trimmed = featureKey.trim();
    if (!trimmed.length) {
        return { key: null, track: undefined };
    }

    const candidates: string[] = [];
    const pushCandidate = (value: string | null | undefined) => {
        if (!value) {
            return;
        }
        const normalized = value.trim();
        if (!normalized.length) {
            return;
        }
        if (!candidates.includes(normalized)) {
            candidates.push(normalized);
        }
    };

    const trackEntries = cache.featureTracks;
    pushCandidate(trimmed);

    const parsed = parseFeatureTrackKey(trimmed);
    const baseFeatureKey = parsed.featureKey || trimmed;

    const requestedProfile = sanitizeAnalysisProfileId(options.analysisProfileId);
    if (requestedProfile) {
        pushCandidate(buildFeatureTrackKey(baseFeatureKey, requestedProfile));
    }

    if (parsed.analysisProfileId) {
        pushCandidate(buildFeatureTrackKey(baseFeatureKey, parsed.analysisProfileId));
    }

    const fallbackProfile =
        sanitizeAnalysisProfileId(options.fallbackProfileId) ??
        sanitizeAnalysisProfileId(cache.defaultAnalysisProfileId);
    if (fallbackProfile) {
        pushCandidate(buildFeatureTrackKey(baseFeatureKey, fallbackProfile));
    }

    pushCandidate(buildFeatureTrackKey(baseFeatureKey, DEFAULT_ANALYSIS_PROFILE_ID));
    pushCandidate(baseFeatureKey);

    for (const candidate of candidates) {
        const track = trackEntries[candidate];
        if (track) {
            return { key: candidate, track };
        }
    }

    return { key: candidates[0] ?? trimmed, track: undefined };
}
