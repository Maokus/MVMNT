import { create } from 'zustand';
import type {
    AudioFeatureAnalysisProfileDescriptor,
    AudioFeatureCache,
    AudioFeatureDescriptor,
    ChannelLayoutMeta,
} from '@audio/features/audioFeatureTypes';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import {
    buildDescriptorId,
    buildDescriptorIdentityKey,
    buildDescriptorMatchKey,
    buildDescriptorLabel,
    subscribeToAnalysisIntents,
    type AnalysisIntent,
} from '@audio/features/analysisIntents';
import { isAdhocAnalysisProfileId } from '@audio/features/analysisProfileRegistry';
import { getFeatureRequirements, type AudioFeatureRequirement } from '@core/scene/elements/audioElementMetadata';
import { useTimelineStore, type TimelineState } from './timelineStore';
import {
    parseFeatureTrackKey,
    resolveFeatureTrackFromCache,
    sanitizeAnalysisProfileId,
} from '@audio/features/featureTrackIdentity';

interface DescriptorInfo {
    descriptor: AudioFeatureDescriptor;
    descriptorId: string;
    matchKey: string;
    identityKey: string;
    profileId: string | null;
    profileKey: string;
    requestKey: string;
    profileOverridesHash: string | null;
}

interface RequirementDiagnostic {
    requirement: AudioFeatureRequirement;
    descriptor: AudioFeatureDescriptor;
    matchKey: string;
    identityKey: string;
    profileKey: string;
    requestKey: string;
    satisfied: boolean;
}

export interface CacheDescriptorDetail {
    descriptor: AudioFeatureDescriptor;
    channelCount: number | null;
    channelAliases: string[] | null;
    channelLayout: ChannelLayoutMeta | null;
    analysisProfileId: string | null;
}

interface AnalysisIntentRecord {
    elementId: string;
    elementType: string;
    trackRef: string;
    analysisProfileId: string | null;
    descriptors: Record<string, DescriptorInfo>;
    requestedAt: string;
    autoManaged: boolean;
    requirementDiagnostics: RequirementDiagnostic[];
    unexpectedDescriptors: string[];
    profileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

export type CacheDiffStatus = 'clear' | 'issues';

export interface CacheDiff {
    trackRefs: string[];
    audioSourceId: string;
    analysisProfileId: string | null;
    descriptorsRequested: string[];
    descriptorsCached: string[];
    missing: string[];
    stale: string[];
    extraneous: string[];
    badRequest: string[];
    regenerating: string[];
    descriptorDetails: Record<string, CacheDescriptorDetail>;
    owners: Record<string, string[]>;
    updatedAt: number;
    status: CacheDiffStatus;
}

export type RegenerationReason = 'missing' | 'stale' | 'manual';
export type RegenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface RegenerationJob {
    id: string;
    trackRef: string;
    audioSourceId: string;
    analysisProfileId: string | null;
    descriptors: string[];
    descriptorDetails: Record<string, CacheDescriptorDetail>;
    reason: RegenerationReason;
    status: RegenerationStatus;
    requestedAt: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
}

export type AnalysisHistoryAction = 'auto_regenerate' | 'manual_regenerate' | 'dismissed';
export type AnalysisHistoryStatus = 'success' | 'failure';

export interface AnalysisHistoryEntry {
    id: string;
    timestamp: number;
    elementId?: string;
    trackRef: string;
    audioSourceId: string;
    analysisProfileId: string | null;
    descriptorIds: string[];
    action: AnalysisHistoryAction;
    status: AnalysisHistoryStatus;
    durationMs?: number;
    note?: string;
}

interface DiagnosticsPreferences {
    showOnlyIssues: boolean;
    sort: 'severity' | 'track';
}

interface AudioDiagnosticsState {
    intentsByElement: Record<string, AnalysisIntentRecord>;
    diffs: CacheDiff[];
    bannerVisible: boolean;
    panelOpen: boolean;
    preferences: DiagnosticsPreferences;
    jobs: RegenerationJob[];
    history: AnalysisHistoryEntry[];
    pendingDescriptors: Record<string, Set<string>>;
    dismissedExtraneous: Record<string, Set<string>>;
    publishIntent: (intent: AnalysisIntent) => void;
    removeIntent: (elementId: string) => void;
    recomputeDiffs: () => void;
    regenerateDescriptors: (
        trackRef: string,
        analysisProfileId: string | null,
        descriptors: string[],
        reason?: RegenerationReason
    ) => void;
    regenerateAll: () => void;
    deleteExtraneousCaches: () => void;
    dismissExtraneous: (trackRef: string, analysisProfileId: string | null, descriptorId: string) => void;
    setPanelOpen: (open: boolean) => void;
    setPreferences: (prefs: Partial<DiagnosticsPreferences>) => void;
    recordHistory: (entry: AnalysisHistoryEntry) => void;
    getHistorySummary: () => { generatedAt: string; entries: AnalysisHistoryEntry[] };
    reset: () => void;
}

const HISTORY_LIMIT = 1000;

function makeGroupKey(audioSourceId: string, analysisProfileId: string | null): string {
    return `${audioSourceId}__${analysisProfileId ?? 'null'}`;
}

function resolveAudioSourceId(trackRef: string, state: Pick<TimelineState, 'tracks'>): string {
    const track = state.tracks[trackRef] as { id: string; type: string; audioSourceId?: string } | undefined;
    if (track && track.type === 'audio') {
        return track.audioSourceId ?? track.id;
    }
    return trackRef;
}

function extractFeatureKey(descriptorId: string): string | null {
    if (!descriptorId) {
        return null;
    }
    const content = descriptorId.startsWith('id:') ? descriptorId.slice(3) : descriptorId;
    const parts = content.split('|');
    for (const part of parts) {
        if (part.startsWith('feature:')) {
            const key = part.slice('feature:'.length).trim();
            return key.length ? key : null;
        }
    }
    return null;
}

const DEFAULT_PROFILE_KEY = 'default';

function sanitizeProfileId(value: string | null | undefined): string | null {
    return sanitizeAnalysisProfileId(value);
}

function normalizeProfileKey(value: string | null | undefined): string {
    const sanitized = sanitizeProfileId(value);
    return sanitized ?? DEFAULT_PROFILE_KEY;
}

function extractProfileOverridesHash(profileId: string | null | undefined): string | null {
    const sanitized = sanitizeProfileId(profileId);
    if (!sanitized || !isAdhocAnalysisProfileId(sanitized)) {
        return null;
    }
    const separatorIndex = sanitized.indexOf('-');
    if (separatorIndex < 0) {
        return null;
    }
    const suffix = sanitized.slice(separatorIndex + 1);
    return suffix.length ? suffix : null;
}

function buildDescriptorRequestKey(matchKey: string, profileKey: string, profileHash?: string | null): string {
    const parts = [`${matchKey}`, `profile:${profileKey}`];
    if (profileHash && profileHash.length) {
        parts.push(`hash:${profileHash}`);
    }
    return parts.join('|');
}

function isDescriptorKnown(
    descriptor: AudioFeatureDescriptor | undefined,
    knownFeatures: Set<string>,
    calculatorFeatureById: Map<string, string>
): boolean {
    if (!descriptor?.featureKey) {
        return false;
    }
    if (!knownFeatures.has(descriptor.featureKey)) {
        return false;
    }
    const calculatorId = descriptor.calculatorId;
    if (!calculatorId) {
        return true;
    }
    const featureForCalculator = calculatorFeatureById.get(calculatorId);
    return featureForCalculator === descriptor.featureKey;
}

interface CachedDescriptorInfo {
    id: string;
    descriptor: AudioFeatureDescriptor;
    matchKey: string;
    identityKey: string;
    profileId: string | null;
    profileKey: string;
    requestKey: string;
    profileOverridesHash: string | null;
    channelCount: number | null;
    channelAliases: string[] | null;
    channelLayout: ChannelLayoutMeta | null;
}

function resolveChannelMetadata(
    featureTrack:
        | { channels?: number; channelAliases?: string[] | null; channelLayout?: ChannelLayoutMeta | null }
        | undefined,
    cache: AudioFeatureCache | undefined
): { channelCount: number | null; channelAliases: string[] | null; channelLayout: ChannelLayoutMeta | null } {
    if (!featureTrack) {
        return { channelCount: null, channelAliases: null, channelLayout: null };
    }
    const channelCount = Number.isFinite(featureTrack.channels) ? Number(featureTrack.channels) : null;
    const layout = featureTrack.channelLayout ?? null;
    const aliases = layout?.aliases ?? featureTrack.channelAliases ?? cache?.channelAliases ?? null;
    return { channelCount, channelAliases: aliases ?? null, channelLayout: layout };
}

function collectCachedDescriptorInfos(cache: AudioFeatureCache | undefined): CachedDescriptorInfo[] {
    if (!cache) return [];
    const entries = new Map<string, CachedDescriptorInfo>();
    for (const track of Object.values(cache.featureTracks ?? {})) {
        if (!track) continue;
        const identity = parseFeatureTrackKey(track.key);
        const profileId = sanitizeProfileId(
            track.analysisProfileId ?? identity.analysisProfileId ?? cache.defaultAnalysisProfileId ?? null
        );
        const profileKey = normalizeProfileKey(profileId);
        const profileOverridesHash = extractProfileOverridesHash(profileId);
        const base: AudioFeatureDescriptor = {
            featureKey: identity.featureKey || track.key,
            calculatorId: track.calculatorId,
            bandIndex: null,
            analysisProfileId: profileId,
            requestedAnalysisProfileId: profileId,
            profileOverridesHash,
        };
        const baseId = buildDescriptorId(base);
        const baseMatch = buildDescriptorMatchKey(base);
        const identityKey = buildDescriptorIdentityKey(base);
        const requestKey = buildDescriptorRequestKey(baseMatch, profileKey, profileOverridesHash);
        const meta = resolveChannelMetadata(track, cache);
        entries.set(requestKey, {
            id: baseId,
            descriptor: base,
            matchKey: baseMatch,
            identityKey,
            profileId,
            profileKey,
            requestKey,
            profileOverridesHash,
            channelCount: meta.channelCount,
            channelAliases: meta.channelAliases,
            channelLayout: meta.channelLayout,
        });
    }
    return Array.from(entries.values());
}

function createDescriptorDetail(
    descriptor: AudioFeatureDescriptor | undefined,
    cache: AudioFeatureCache | undefined,
    profileId: string | null,
    overrides?: Partial<Omit<CacheDescriptorDetail, 'descriptor' | 'analysisProfileId'>>
): CacheDescriptorDetail | null {
    if (!descriptor) {
        return null;
    }
    const { track: featureTrack } = resolveFeatureTrackFromCache(cache, descriptor.featureKey ?? null, {
        analysisProfileId: profileId,
    });
    const meta = resolveChannelMetadata(featureTrack, cache);
    return {
        descriptor,
        channelCount: overrides?.channelCount ?? meta.channelCount,
        channelAliases: overrides?.channelAliases ?? meta.channelAliases,
        channelLayout: overrides?.channelLayout ?? meta.channelLayout,
        analysisProfileId: profileId,
    };
}

function computeCacheDiffs(
    intentsByElement: Record<string, AnalysisIntentRecord>,
    timelineState: Pick<TimelineState, 'tracks' | 'audioFeatureCaches' | 'audioFeatureCacheStatus'>,
    pendingDescriptors: Record<string, Set<string>>,
    dismissedExtraneous: Record<string, Set<string>>
): { diffs: CacheDiff[]; dismissedExtraneous: Record<string, Set<string>> } {
    const groups = new Map<
        string,
        {
            audioSourceId: string;
            analysisProfileId: string | null;
            descriptors: Map<string, DescriptorInfo>;
            owners: Map<string, Set<string>>;
            requestedAt: number;
            trackRefs: Set<string>;
        }
    >();
    const requestsBySource = new Map<string, Set<string>>();
    const profilesBySource = new Map<string, Set<string>>();
    const extraneousAssignedBySource = new Map<string, Set<string>>();
    const requiredRequestKeys = new Set<string>();

    const calculators = audioFeatureCalculatorRegistry.list();
    const knownFeatures = new Set(calculators.map((entry) => entry.featureKey));
    const calculatorFeatureById = new Map(calculators.map((entry) => [entry.id, entry.featureKey]));

    for (const record of Object.values(intentsByElement)) {
        const audioSourceId = resolveAudioSourceId(record.trackRef, timelineState);
        const key = makeGroupKey(audioSourceId, record.analysisProfileId);
        let entry = groups.get(key);
        if (!entry) {
            entry = {
                audioSourceId,
                analysisProfileId: record.analysisProfileId,
                descriptors: new Map(),
                owners: new Map(),
                requestedAt: Date.parse(record.requestedAt) || Date.now(),
                trackRefs: new Set<string>(),
            };
            groups.set(key, entry);
        }
        entry.trackRefs.add(record.trackRef);

        const profileKey = normalizeProfileKey(record.analysisProfileId);
        let profileSet = profilesBySource.get(audioSourceId);
        if (!profileSet) {
            profileSet = new Set<string>();
            profilesBySource.set(audioSourceId, profileSet);
        }
        profileSet.add(profileKey);

        let requestSet = requestsBySource.get(audioSourceId);
        if (!requestSet) {
            requestSet = new Set<string>();
            requestsBySource.set(audioSourceId, requestSet);
        }

        for (const info of Object.values(record.descriptors)) {
            entry.descriptors.set(info.requestKey, info);
            let owners = entry.owners.get(info.requestKey);
            if (!owners) {
                owners = new Set();
                entry.owners.set(info.requestKey, owners);
            }
            owners.add(record.elementId);
            requestSet.add(info.requestKey);
            requiredRequestKeys.add(info.requestKey);
        }

        for (const requirement of record.requirementDiagnostics ?? []) {
            requiredRequestKeys.add(requirement.requestKey);
        }
    }

    const sanitizedDismissed: Record<string, Set<string>> = {};
    for (const [key, set] of Object.entries(dismissedExtraneous)) {
        if (!set || !(set instanceof Set)) {
            continue;
        }
        const separatorIndex = key.lastIndexOf('__');
        const idPart = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
        const profilePartRaw = separatorIndex >= 0 ? key.slice(separatorIndex + 2) : 'null';
        const profileId = profilePartRaw === 'null' ? null : profilePartRaw;
        const resolvedSourceId = timelineState.tracks[idPart] ? resolveAudioSourceId(idPart, timelineState) : idPart;
        const normalizedKey = makeGroupKey(resolvedSourceId, profileId);
        let filtered = sanitizedDismissed[normalizedKey];
        if (!filtered) {
            filtered = new Set<string>();
            sanitizedDismissed[normalizedKey] = filtered;
        }
        for (const value of set) {
            if (!requiredRequestKeys.has(value)) {
                filtered.add(value);
            }
        }
        if (filtered.size === 0) {
            delete sanitizedDismissed[normalizedKey];
        }
    }

    const diffs: CacheDiff[] = [];
    const now = Date.now();

    for (const group of groups.values()) {
        const cache = timelineState.audioFeatureCaches[group.audioSourceId];
        const status = timelineState.audioFeatureCacheStatus[group.audioSourceId];
        const requested = Array.from(group.descriptors.keys()).sort();
        const descriptorDetails: Record<string, CacheDescriptorDetail> = {};
        const ownerMap: Record<string, string[]> = {};
        for (const [descriptorKey, info] of group.descriptors.entries()) {
            const detail = createDescriptorDetail(info.descriptor, cache, info.profileId);
            if (detail) {
                descriptorDetails[descriptorKey] = detail;
            }
            ownerMap[descriptorKey] = Array.from(group.owners.get(descriptorKey) ?? []);
        }
        const cachedInfos = collectCachedDescriptorInfos(cache);
        const cachedLookup = new Map<string, CachedDescriptorInfo>();
        for (const info of cachedInfos) {
            cachedLookup.set(info.requestKey, info);
            if (!descriptorDetails[info.requestKey]) {
                const cachedDetail = createDescriptorDetail(info.descriptor, cache, info.profileId, {
                    channelCount: info.channelCount,
                    channelAliases: info.channelAliases,
                    channelLayout: info.channelLayout,
                });
                if (cachedDetail) {
                    descriptorDetails[info.requestKey] = cachedDetail;
                }
            }
            if (!ownerMap[info.requestKey]) {
                ownerMap[info.requestKey] = [];
            }
        }
        const missing: string[] = [];
        const stale: string[] = [];
        const badRequest: string[] = [];
        const regenerating: string[] = [];
        const extraneous: string[] = [];
        const pendingKey = makeGroupKey(group.audioSourceId, group.analysisProfileId);
        const pendingSet = pendingDescriptors[pendingKey] ?? new Set();
        const dismissedSet = sanitizedDismissed[pendingKey] ?? new Set();
        const sourceStale = status?.state === 'stale';
        const sourceRequestSet = requestsBySource.get(group.audioSourceId) ?? new Set<string>();
        const sourceProfiles = profilesBySource.get(group.audioSourceId) ?? new Set<string>();
        const groupProfileKey = normalizeProfileKey(group.analysisProfileId);
        let assignedSet = extraneousAssignedBySource.get(group.audioSourceId);
        if (!assignedSet) {
            assignedSet = new Set<string>();
            extraneousAssignedBySource.set(group.audioSourceId, assignedSet);
        }

        for (const descriptorKey of requested) {
            const info = group.descriptors.get(descriptorKey);
            if (!info) continue;
            if (pendingSet.has(descriptorKey)) {
                regenerating.push(descriptorKey);
                continue;
            }
            const descriptorValid = isDescriptorKnown(info.descriptor, knownFeatures, calculatorFeatureById);
            if (!descriptorValid) {
                badRequest.push(descriptorKey);
                continue;
            }
            const cached = cachedLookup.get(descriptorKey);
            if (!cached) {
                missing.push(descriptorKey);
                continue;
            }
            if (sourceStale) {
                stale.push(descriptorKey);
                continue;
            }
            if (cached.profileKey !== info.profileKey) {
                stale.push(descriptorKey);
            }
        }

        for (const cached of cachedInfos) {
            if (sourceRequestSet.has(cached.requestKey)) continue;
            if (dismissedSet.has(cached.requestKey)) continue;
            if (assignedSet.has(cached.requestKey)) continue;
            const profileMatchesGroup = groupProfileKey === cached.profileKey;
            const profileRepresented = sourceProfiles.has(cached.profileKey);
            if (!profileMatchesGroup && profileRepresented) {
                continue;
            }
            extraneous.push(cached.requestKey);
            assignedSet.add(cached.requestKey);
        }

        const descriptorsCached = cachedInfos.map((info) => info.requestKey);
        const hasIssues = missing.length + stale.length + extraneous.length + badRequest.length > 0;
        diffs.push({
            trackRefs: Array.from(group.trackRefs).sort(),
            audioSourceId: group.audioSourceId,
            analysisProfileId: group.analysisProfileId,
            descriptorsRequested: requested,
            descriptorsCached,
            missing,
            stale,
            extraneous,
            badRequest,
            regenerating,
            descriptorDetails,
            owners: ownerMap,
            updatedAt: now,
            status: hasIssues ? 'issues' : 'clear',
        });
    }

    diffs.sort((a, b) => {
        if (a.status !== b.status) {
            return a.status === 'issues' ? -1 : 1;
        }
        const aLabel = a.trackRefs[0] ?? a.audioSourceId;
        const bLabel = b.trackRefs[0] ?? b.audioSourceId;
        return aLabel.localeCompare(bLabel);
    });

    return { diffs, dismissedExtraneous: sanitizedDismissed };
}

let jobCounter = 0;
function createJobId(): string {
    jobCounter += 1;
    return `diag-job-${Date.now()}-${jobCounter}`;
}

const activeJobKeys = new Set<string>();

function resolveCalculators(job: RegenerationJob, cache: AudioFeatureCache | undefined): string[] {
    const calculators = new Set<string>();
    for (const descriptorId of job.descriptors) {
        const descriptor = job.descriptorDetails[descriptorId]?.descriptor;
        if (descriptor?.calculatorId) {
            calculators.add(descriptor.calculatorId);
            continue;
        }
        const featureKey = descriptor?.featureKey;
        if (!featureKey) continue;
        const track = cache?.featureTracks?.[featureKey];
        if (track?.calculatorId) {
            calculators.add(track.calculatorId);
        }
    }
    return Array.from(calculators);
}

const initialState: Omit<
    AudioDiagnosticsState,
    | 'publishIntent'
    | 'removeIntent'
    | 'recomputeDiffs'
    | 'regenerateDescriptors'
    | 'regenerateAll'
    | 'deleteExtraneousCaches'
    | 'dismissExtraneous'
    | 'setPanelOpen'
    | 'setPreferences'
    | 'recordHistory'
    | 'getHistorySummary'
    | 'reset'
> = {
    intentsByElement: {},
    diffs: [],
    bannerVisible: false,
    panelOpen: false,
    preferences: { showOnlyIssues: true, sort: 'severity' },
    jobs: [],
    history: [],
    pendingDescriptors: {},
    dismissedExtraneous: {},
};

export const useAudioDiagnosticsStore = create<AudioDiagnosticsState>((set, get) => ({
    ...initialState,
    publishIntent(intent: AnalysisIntent) {
        const intentProfileId = sanitizeProfileId(intent.analysisProfileId);
        const descriptors: Record<string, DescriptorInfo> = {};
        for (const entry of intent.descriptors) {
            const descriptorProfileId = sanitizeProfileId(
                entry.descriptor.analysisProfileId ?? entry.descriptor.requestedAnalysisProfileId ?? intentProfileId
            );
            const profileKey = normalizeProfileKey(descriptorProfileId);
            const matchKey = entry.matchKey;
            const identityKey = buildDescriptorIdentityKey(entry.descriptor);
            const profileOverridesHash = entry.descriptor.profileOverridesHash ?? null;
            const requestKey = buildDescriptorRequestKey(matchKey, profileKey, profileOverridesHash);
            descriptors[requestKey] = {
                descriptor: entry.descriptor,
                descriptorId: entry.id,
                matchKey,
                identityKey,
                profileId: descriptorProfileId,
                profileKey,
                requestKey,
                profileOverridesHash,
            };
        }
        const requirements = getFeatureRequirements(intent.elementType);
        const normalizedRequirements = requirements.map((requirement) => {
            const { descriptor, profile } = createFeatureDescriptor({
                feature: requirement.feature,
                bandIndex: requirement.bandIndex ?? undefined,
                calculatorId: requirement.calculatorId ?? undefined,
                profile: requirement.profile ?? undefined,
                profileParams: requirement.profileParams ?? undefined,
            });
            const requirementProfileId = sanitizeProfileId(
                descriptor.analysisProfileId ?? descriptor.requestedAnalysisProfileId ?? profile ?? null
            );
            const requirementProfileKey = normalizeProfileKey(requirementProfileId);
            const matchKey = buildDescriptorMatchKey(descriptor);
            const profileOverridesHash = descriptor.profileOverridesHash ?? null;
            return {
                requirement,
                descriptor,
                matchKey,
                identityKey: buildDescriptorIdentityKey(descriptor),
                profileKey: requirementProfileKey,
                requestKey: buildDescriptorRequestKey(matchKey, requirementProfileKey, profileOverridesHash),
            };
        });
        const descriptorRequestKeys = new Set(Object.keys(descriptors));
        const requirementDiagnostics: RequirementDiagnostic[] = normalizedRequirements.map((entry) => ({
            requirement: entry.requirement,
            descriptor: entry.descriptor,
            matchKey: entry.matchKey,
            identityKey: entry.identityKey,
            profileKey: entry.profileKey,
            requestKey: entry.requestKey,
            satisfied: descriptorRequestKeys.has(entry.requestKey),
        }));
        const requirementKeys = new Set(normalizedRequirements.map((entry) => entry.requestKey));
        const unexpectedDescriptors = Object.values(descriptors)
            .map((entry) => entry.requestKey)
            .filter((key) => !requirementKeys.has(key));
        const autoManaged = requirementDiagnostics.length > 0;
        set((state) => ({
            intentsByElement: {
                ...state.intentsByElement,
                [intent.elementId]: {
                    elementId: intent.elementId,
                    elementType: intent.elementType,
                    trackRef: intent.trackRef,
                    analysisProfileId: intentProfileId,
                    descriptors,
                    requestedAt: intent.requestedAt,
                    autoManaged,
                    requirementDiagnostics,
                    unexpectedDescriptors,
                    profileRegistryDelta: intent.profileRegistryDelta ?? null,
                },
            },
        }));
        get().recomputeDiffs();
    },
    removeIntent(elementId: string) {
        set((state) => {
            if (!state.intentsByElement[elementId]) {
                return state;
            }
            const next = { ...state.intentsByElement };
            delete next[elementId];
            return { intentsByElement: next };
        });
        get().recomputeDiffs();
    },
    recomputeDiffs() {
        const timelineState = useTimelineStore.getState();
        const { diffs, dismissedExtraneous: nextDismissed } = computeCacheDiffs(
            get().intentsByElement,
            {
                tracks: timelineState.tracks,
                audioFeatureCaches: timelineState.audioFeatureCaches,
                audioFeatureCacheStatus: timelineState.audioFeatureCacheStatus,
            },
            get().pendingDescriptors,
            get().dismissedExtraneous
        );
        const bannerVisible = diffs.some(
            (diff) => diff.missing.length + diff.stale.length + diff.badRequest.length > 0
        );
        set({ diffs, bannerVisible, dismissedExtraneous: nextDismissed });
    },
    regenerateDescriptors(trackRef, analysisProfileId, descriptors, reason = 'manual') {
        const unique = Array.from(new Set(descriptors.filter(Boolean)));
        if (!unique.length) {
            return;
        }
        const timelineState = useTimelineStore.getState();
        const sourceId = resolveAudioSourceId(trackRef, timelineState);
        const diff = get().diffs.find(
            (entry) =>
                entry.audioSourceId === sourceId &&
                entry.analysisProfileId === analysisProfileId &&
                (entry.trackRefs.length === 0 || entry.trackRefs.includes(trackRef))
        );
        const descriptorDetails = diff?.descriptorDetails ?? {};
        const job: RegenerationJob = {
            id: createJobId(),
            trackRef,
            audioSourceId: sourceId,
            analysisProfileId,
            descriptors: unique,
            descriptorDetails,
            reason,
            status: 'queued',
            requestedAt: Date.now(),
        };
        set((state) => {
            const key = makeGroupKey(sourceId, analysisProfileId);
            const nextPending = { ...state.pendingDescriptors };
            const pending = new Set(nextPending[key] ?? []);
            unique.forEach((id) => pending.add(id));
            nextPending[key] = pending;
            return {
                jobs: [...state.jobs, job],
                pendingDescriptors: nextPending,
            };
        });
        processJobQueue();
    },
    regenerateAll() {
        const groups = new Map<
            string,
            { audioSourceId: string; trackRef: string; analysisProfileId: string | null; descriptors: string[] }
        >();
        for (const diff of get().diffs) {
            const targets = [...diff.missing, ...diff.stale];
            if (!targets.length) continue;
            const primaryTrack = diff.trackRefs[0] ?? diff.audioSourceId;
            const key = makeGroupKey(diff.audioSourceId, diff.analysisProfileId);
            const entry = groups.get(key);
            if (entry) {
                entry.descriptors.push(...targets);
            } else {
                groups.set(key, {
                    audioSourceId: diff.audioSourceId,
                    trackRef: primaryTrack,
                    analysisProfileId: diff.analysisProfileId,
                    descriptors: targets,
                });
            }
        }
        for (const entry of groups.values()) {
            get().regenerateDescriptors(entry.trackRef, entry.analysisProfileId, entry.descriptors, 'manual');
        }
    },
    deleteExtraneousCaches() {
        const timelineState = useTimelineStore.getState();
        const removeTracks = timelineState.removeAudioFeatureTracks;
        if (typeof removeTracks !== 'function') {
            console.warn('[audioDiagnostics] removeAudioFeatureTracks action unavailable on timeline store');
            return;
        }
        const groups = new Map<string, Set<string>>();
        for (const diff of get().diffs) {
            if (!diff.extraneous.length) continue;
            let featureSet = groups.get(diff.audioSourceId);
            if (!featureSet) {
                featureSet = new Set<string>();
                groups.set(diff.audioSourceId, featureSet);
            }
            for (const descriptorId of diff.extraneous) {
                const detail = diff.descriptorDetails[descriptorId];
                const featureKey = detail?.descriptor?.featureKey ?? extractFeatureKey(descriptorId);
                if (featureKey) {
                    featureSet.add(featureKey);
                }
            }
        }
        if (!groups.size) {
            return;
        }
        for (const [sourceId, featureSet] of groups.entries()) {
            removeTracks(sourceId, Array.from(featureSet));
        }
        get().recomputeDiffs();
    },
    dismissExtraneous(trackRef, analysisProfileId, descriptorId) {
        const timelineState = useTimelineStore.getState();
        const sourceId = resolveAudioSourceId(trackRef, timelineState);
        set((state) => {
            const key = makeGroupKey(sourceId, analysisProfileId);
            const next = { ...state.dismissedExtraneous };
            const setForKey = new Set(next[key] ?? []);
            setForKey.add(descriptorId);
            next[key] = setForKey;
            return { dismissedExtraneous: next };
        });
        get().recordHistory({
            id: `dismiss-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            trackRef,
            audioSourceId: sourceId,
            analysisProfileId,
            descriptorIds: [descriptorId],
            action: 'dismissed',
            status: 'success',
        });
        get().recomputeDiffs();
    },
    setPanelOpen(open) {
        set({ panelOpen: open });
    },
    setPreferences(prefs) {
        set((state) => ({ preferences: { ...state.preferences, ...prefs } }));
    },
    recordHistory(entry) {
        set((state) => {
            const next = [...state.history, entry];
            while (next.length > HISTORY_LIMIT) {
                next.shift();
            }
            return { history: next };
        });
    },
    getHistorySummary() {
        const entries = get().history;
        return { generatedAt: new Date().toISOString(), entries };
    },
    reset() {
        set({ ...initialState });
    },
}));

function processJobQueue(): void {
    const state = useAudioDiagnosticsStore.getState();
    for (const job of state.jobs) {
        if (job.status !== 'queued') continue;
        const key = makeGroupKey(job.audioSourceId, job.analysisProfileId);
        if (activeJobKeys.has(key)) {
            continue;
        }
        runJob(job.id);
    }
}

function runJob(jobId: string): void {
    const state = useAudioDiagnosticsStore.getState();
    const job = state.jobs.find((entry) => entry.id === jobId);
    if (!job || job.status !== 'queued') {
        return;
    }
    const key = makeGroupKey(job.audioSourceId, job.analysisProfileId);
    activeJobKeys.add(key);
    const startedAt = Date.now();
    useAudioDiagnosticsStore.setState((current) => ({
        jobs: current.jobs.map((entry) => (entry.id === jobId ? { ...entry, status: 'running', startedAt } : entry)),
    }));
    queueMicrotask(async () => {
        let status: RegenerationStatus = 'succeeded';
        let errorMessage: string | undefined;
        try {
            const timelineState = useTimelineStore.getState();
            const cache = timelineState.audioFeatureCaches[job.audioSourceId];
            const calculators = resolveCalculators(job, cache);
            if (calculators.length) {
                timelineState.reanalyzeAudioFeatureCalculators(job.audioSourceId, calculators, job.analysisProfileId);
            } else {
                timelineState.restartAudioFeatureAnalysis(job.audioSourceId, job.analysisProfileId);
            }
        } catch (error) {
            status = 'failed';
            errorMessage = error instanceof Error ? error.message : 'Regeneration failed';
        }
        const completedAt = Date.now();
        useAudioDiagnosticsStore.setState((current) => {
            const nextJobs = current.jobs.map((entry) =>
                entry.id === jobId
                    ? {
                          ...entry,
                          status,
                          completedAt,
                          error: errorMessage,
                      }
                    : entry
            );
            const pendingKey = makeGroupKey(job.audioSourceId, job.analysisProfileId);
            const nextPending = { ...current.pendingDescriptors };
            const pending = new Set(nextPending[pendingKey] ?? []);
            for (const descriptorId of job.descriptors) {
                pending.delete(descriptorId);
            }
            if (pending.size) {
                nextPending[pendingKey] = pending;
            } else {
                delete nextPending[pendingKey];
            }
            const historyEntry: AnalysisHistoryEntry = {
                id: job.id,
                timestamp: completedAt,
                trackRef: job.trackRef,
                audioSourceId: job.audioSourceId,
                analysisProfileId: job.analysisProfileId,
                descriptorIds: job.descriptors,
                action: 'manual_regenerate',
                status: status === 'succeeded' ? 'success' : 'failure',
                durationMs: job.startedAt ? completedAt - job.startedAt : undefined,
                note: errorMessage,
            };
            const nextHistory = [...current.history, historyEntry];
            while (nextHistory.length > HISTORY_LIMIT) {
                nextHistory.shift();
            }
            return {
                jobs: nextJobs,
                pendingDescriptors: nextPending,
                history: nextHistory,
            };
        });
        useAudioDiagnosticsStore.getState().recomputeDiffs();
        activeJobKeys.delete(key);
        processJobQueue();
    });
}

subscribeToAnalysisIntents((event) => {
    if (event.type === 'publish') {
        useAudioDiagnosticsStore.getState().publishIntent(event.intent);
    } else {
        useAudioDiagnosticsStore.getState().removeIntent(event.elementId);
    }
});

let previousCacheRef = useTimelineStore.getState().audioFeatureCaches;
let previousStatusRef = useTimelineStore.getState().audioFeatureCacheStatus;
useTimelineStore.subscribe((state) => {
    const cacheChanged = state.audioFeatureCaches !== previousCacheRef;
    const statusChanged = state.audioFeatureCacheStatus !== previousStatusRef;
    if (!cacheChanged && !statusChanged) {
        return;
    }
    previousCacheRef = state.audioFeatureCaches;
    previousStatusRef = state.audioFeatureCacheStatus;
    useAudioDiagnosticsStore.getState().recomputeDiffs();
});

let previousTracksRef = useTimelineStore.getState().tracks;
useTimelineStore.subscribe((state) => {
    if (state.tracks === previousTracksRef) {
        return;
    }
    previousTracksRef = state.tracks;
    const trackIds = new Set(Object.keys(state.tracks));
    const diagnostics = useAudioDiagnosticsStore.getState();
    for (const record of Object.values(diagnostics.intentsByElement)) {
        if (!trackIds.has(record.trackRef)) {
            useAudioDiagnosticsStore.getState().removeIntent(record.elementId);
        }
    }
});

export function formatCacheDiffDescriptor(diff: CacheDiff, descriptorId: string): string {
    const detail = diff.descriptorDetails[descriptorId];
    const descriptor = detail?.descriptor;
    const label = buildDescriptorLabel(descriptor);
    if (!detail) {
        return label;
    }
    const profile = detail.analysisProfileId ?? DEFAULT_PROFILE_KEY;
    return `${label} · profile ${profile}`;
}

export function getDiagnosticsPanelState() {
    return useAudioDiagnosticsStore.getState();
}

export type AnalysisHistorySummary = ReturnType<AudioDiagnosticsState['getHistorySummary']>;
