import { create } from 'zustand';
import type { AudioFeatureCache, AudioFeatureDescriptor, ChannelLayoutMeta } from '@audio/features/audioFeatureTypes';
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import {
    buildDescriptorId,
    buildDescriptorMatchKey,
    buildDescriptorLabel,
    subscribeToAnalysisIntents,
    type AnalysisIntent,
} from '@audio/features/analysisIntents';
import { getFeatureRequirements, type AudioFeatureRequirement } from '@core/scene/elements/audioElementMetadata';
import { useTimelineStore, type TimelineState } from './timelineStore';

interface DescriptorInfo {
    descriptor: AudioFeatureDescriptor;
    descriptorId: string;
    matchKey: string;
    profileId: string | null;
    profileKey: string;
    requestKey: string;
}

interface RequirementDiagnostic {
    requirement: AudioFeatureRequirement;
    descriptor: AudioFeatureDescriptor;
    matchKey: string;
    profileKey: string;
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
}

export type CacheDiffStatus = 'clear' | 'issues';

export interface CacheDiff {
    trackRef: string;
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

function makeGroupKey(trackRef: string, analysisProfileId: string | null): string {
    return `${trackRef}__${analysisProfileId ?? 'null'}`;
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
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function normalizeProfileKey(value: string | null | undefined): string {
    const sanitized = sanitizeProfileId(value);
    return sanitized ?? DEFAULT_PROFILE_KEY;
}

function buildDescriptorRequestKey(matchKey: string, profileKey: string): string {
    return `${matchKey}|profile:${profileKey}`;
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
    profileId: string | null;
    profileKey: string;
    requestKey: string;
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
        const base: AudioFeatureDescriptor = {
            featureKey: track.key,
            calculatorId: track.calculatorId,
            bandIndex: null,
        };
        const baseId = buildDescriptorId(base);
        const baseMatch = buildDescriptorMatchKey(base);
        const profileId = sanitizeProfileId(track.analysisProfileId ?? cache.defaultAnalysisProfileId ?? null);
        const profileKey = normalizeProfileKey(profileId);
        const requestKey = buildDescriptorRequestKey(baseMatch, profileKey);
        const meta = resolveChannelMetadata(track, cache);
        entries.set(requestKey, {
            id: baseId,
            descriptor: base,
            matchKey: baseMatch,
            profileId,
            profileKey,
            requestKey,
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
    const featureTrack = descriptor.featureKey ? cache?.featureTracks?.[descriptor.featureKey] : undefined;
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
): CacheDiff[] {
    const groups = new Map<
        string,
        {
            trackRef: string;
            analysisProfileId: string | null;
            descriptors: Map<string, DescriptorInfo>;
            owners: Map<string, Set<string>>;
            requestedAt: number;
        }
    >();
    const requestsByTrack = new Map<string, Set<string>>();
    const profilesByTrack = new Map<string, Set<string>>();
    const extraneousAssignedByTrack = new Map<string, Set<string>>();

    const calculators = audioFeatureCalculatorRegistry.list();
    const knownFeatures = new Set(calculators.map((entry) => entry.featureKey));
    const calculatorFeatureById = new Map(calculators.map((entry) => [entry.id, entry.featureKey]));

    for (const record of Object.values(intentsByElement)) {
        const key = makeGroupKey(record.trackRef, record.analysisProfileId);
        let entry = groups.get(key);
        if (!entry) {
            entry = {
                trackRef: record.trackRef,
                analysisProfileId: record.analysisProfileId,
                descriptors: new Map(),
                owners: new Map(),
                requestedAt: Date.parse(record.requestedAt) || Date.now(),
            };
            groups.set(key, entry);
        }
        const profileKey = normalizeProfileKey(record.analysisProfileId);
        let profileSet = profilesByTrack.get(record.trackRef);
        if (!profileSet) {
            profileSet = new Set<string>();
            profilesByTrack.set(record.trackRef, profileSet);
        }
        profileSet.add(profileKey);

        let requestSet = requestsByTrack.get(record.trackRef);
        if (!requestSet) {
            requestSet = new Set<string>();
            requestsByTrack.set(record.trackRef, requestSet);
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
        }
    }

    const diffs: CacheDiff[] = [];
    const now = Date.now();

    for (const group of groups.values()) {
        const sourceId = resolveAudioSourceId(group.trackRef, timelineState);
        const cache = timelineState.audioFeatureCaches[sourceId];
        const status = timelineState.audioFeatureCacheStatus[sourceId];
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
        const pendingKey = makeGroupKey(group.trackRef, group.analysisProfileId);
        const pendingSet = pendingDescriptors[pendingKey] ?? new Set();
        const dismissedSet = dismissedExtraneous[pendingKey] ?? new Set();
        const trackStale = status?.state === 'stale';
        const trackRequestSet = requestsByTrack.get(group.trackRef) ?? new Set<string>();
        const trackProfiles = profilesByTrack.get(group.trackRef) ?? new Set<string>();
        const groupProfileKey = normalizeProfileKey(group.analysisProfileId);
        let assignedSet = extraneousAssignedByTrack.get(group.trackRef);
        if (!assignedSet) {
            assignedSet = new Set<string>();
            extraneousAssignedByTrack.set(group.trackRef, assignedSet);
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
            if (trackStale) {
                stale.push(descriptorKey);
                continue;
            }
            if (cached.profileKey !== info.profileKey) {
                stale.push(descriptorKey);
            }
        }

        for (const cached of cachedInfos) {
            if (trackRequestSet.has(cached.requestKey)) continue;
            if (dismissedSet.has(cached.requestKey)) continue;
            if (assignedSet.has(cached.requestKey)) continue;
            const profileMatchesGroup = groupProfileKey === cached.profileKey;
            const profileRepresented = trackProfiles.has(cached.profileKey);
            if (!profileMatchesGroup && profileRepresented) {
                continue;
            }
            extraneous.push(cached.requestKey);
            assignedSet.add(cached.requestKey);
        }

        const descriptorsCached = cachedInfos.map((info) => info.requestKey);
        const hasIssues = missing.length + stale.length + extraneous.length + badRequest.length > 0;
        diffs.push({
            trackRef: group.trackRef,
            audioSourceId: sourceId,
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
        return a.trackRef.localeCompare(b.trackRef);
    });

    return diffs;
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
        const profileId = sanitizeProfileId(intent.analysisProfileId);
        const profileKey = normalizeProfileKey(profileId);
        const descriptors: Record<string, DescriptorInfo> = {};
        for (const entry of intent.descriptors) {
            const requestKey = buildDescriptorRequestKey(entry.matchKey, profileKey);
            descriptors[requestKey] = {
                descriptor: entry.descriptor,
                descriptorId: entry.id,
                matchKey: entry.matchKey,
                profileId,
                profileKey,
                requestKey,
            };
        }
        const requirements = getFeatureRequirements(intent.elementType);
        const normalizedRequirements = requirements.map((requirement) => {
            const { descriptor, profile } = createFeatureDescriptor({
                feature: requirement.feature,
                bandIndex: requirement.bandIndex ?? undefined,
                calculatorId: requirement.calculatorId ?? undefined,
                profile: requirement.profile ?? undefined,
            });
            const requirementProfileId = sanitizeProfileId(profile);
            const requirementProfileKey = normalizeProfileKey(requirementProfileId);
            return {
                requirement,
                descriptor,
                matchKey: buildDescriptorMatchKey(descriptor),
                profileKey: requirementProfileKey,
            };
        });
        const descriptorRequestKeys = new Set(Object.values(descriptors).map((entry) => entry.requestKey));
        const requirementDiagnostics: RequirementDiagnostic[] = normalizedRequirements.map((entry) => ({
            requirement: entry.requirement,
            descriptor: entry.descriptor,
            matchKey: entry.matchKey,
            profileKey: entry.profileKey,
            satisfied: descriptorRequestKeys.has(buildDescriptorRequestKey(entry.matchKey, entry.profileKey)),
        }));
        const requirementKeys = new Set(
            normalizedRequirements.map((entry) => buildDescriptorRequestKey(entry.matchKey, entry.profileKey))
        );
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
                    analysisProfileId: profileId,
                    descriptors,
                    requestedAt: intent.requestedAt,
                    autoManaged,
                    requirementDiagnostics,
                    unexpectedDescriptors,
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
        const diffs = computeCacheDiffs(
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
        set({ diffs, bannerVisible });
    },
    regenerateDescriptors(trackRef, analysisProfileId, descriptors, reason = 'manual') {
        const unique = Array.from(new Set(descriptors.filter(Boolean)));
        if (!unique.length) {
            return;
        }
        const timelineState = useTimelineStore.getState();
        const sourceId = resolveAudioSourceId(trackRef, timelineState);
        const diff = get().diffs.find(
            (entry) => entry.trackRef === trackRef && entry.analysisProfileId === analysisProfileId
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
            const key = makeGroupKey(trackRef, analysisProfileId);
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
        const groups = new Map<string, { trackRef: string; analysisProfileId: string | null; descriptors: string[] }>();
        for (const diff of get().diffs) {
            const targets = [...diff.missing, ...diff.stale];
            if (!targets.length) continue;
            const key = makeGroupKey(diff.trackRef, diff.analysisProfileId);
            const entry = groups.get(key);
            if (entry) {
                entry.descriptors.push(...targets);
            } else {
                groups.set(key, {
                    trackRef: diff.trackRef,
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
            const sourceId = resolveAudioSourceId(diff.trackRef, timelineState);
            let featureSet = groups.get(sourceId);
            if (!featureSet) {
                featureSet = new Set<string>();
                groups.set(sourceId, featureSet);
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
        set((state) => {
            const key = makeGroupKey(trackRef, analysisProfileId);
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
            audioSourceId: resolveAudioSourceId(trackRef, useTimelineStore.getState()),
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
        const key = makeGroupKey(job.trackRef, job.analysisProfileId);
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
    const key = makeGroupKey(job.trackRef, job.analysisProfileId);
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
                timelineState.reanalyzeAudioFeatureCalculators(job.audioSourceId, calculators);
            } else {
                timelineState.restartAudioFeatureAnalysis(job.audioSourceId);
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
            const pendingKey = makeGroupKey(job.trackRef, job.analysisProfileId);
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
