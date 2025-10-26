import { create } from 'zustand';
import type {
    AudioFeatureCache,
    AudioFeatureDescriptor,
    ChannelLayoutMeta,
} from '@audio/features/audioFeatureTypes';
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
    matchKey: string;
}

interface RequirementDiagnostic {
    requirement: AudioFeatureRequirement;
    descriptor: AudioFeatureDescriptor;
    matchKey: string;
    satisfied: boolean;
}

export interface CacheDescriptorDetail {
    descriptor: AudioFeatureDescriptor;
    channelCount: number | null;
    channelAliases: string[] | null;
    channelLayout: ChannelLayoutMeta | null;
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

interface CachedDescriptorInfo {
    id: string;
    descriptor: AudioFeatureDescriptor;
    matchKey: string;
    channelCount: number | null;
    channelAliases: string[] | null;
    channelLayout: ChannelLayoutMeta | null;
}

function resolveChannelMetadata(
    featureTrack: { channels?: number; channelAliases?: string[] | null; channelLayout?: ChannelLayoutMeta | null } | undefined,
    cache: AudioFeatureCache | undefined,
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
        const meta = resolveChannelMetadata(track, cache);
        entries.set(baseMatch, {
            id: baseId,
            descriptor: base,
            matchKey: baseMatch,
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
    overrides?: Partial<Omit<CacheDescriptorDetail, 'descriptor'>>,
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
        for (const [descriptorId, descriptorInfo] of Object.entries(record.descriptors)) {
            entry.descriptors.set(descriptorId, descriptorInfo);
            let owners = entry.owners.get(descriptorId);
            if (!owners) {
                owners = new Set();
                entry.owners.set(descriptorId, owners);
            }
            owners.add(record.elementId);
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
        const matchKeyById: Record<string, string> = {};
        for (const [descriptorId, info] of group.descriptors.entries()) {
            const detail = createDescriptorDetail(info.descriptor, cache);
            if (detail) {
                descriptorDetails[descriptorId] = detail;
            }
            matchKeyById[descriptorId] = info.matchKey;
            ownerMap[descriptorId] = Array.from(group.owners.get(descriptorId) ?? []);
        }
        const cachedInfos = collectCachedDescriptorInfos(cache);
        const cachedMatchLookup = new Map<string, CachedDescriptorInfo>();
        for (const info of cachedInfos) {
            cachedMatchLookup.set(info.matchKey, info);
        }
        const missing: string[] = [];
        const stale: string[] = [];
        const regenerating: string[] = [];
        const extraneous: string[] = [];
        const pendingKey = makeGroupKey(group.trackRef, group.analysisProfileId);
        const pendingSet = pendingDescriptors[pendingKey] ?? new Set();
        const dismissedSet = dismissedExtraneous[pendingKey] ?? new Set();
        const trackStale = status?.state === 'stale';

        for (const descriptorId of requested) {
            const matchKey = matchKeyById[descriptorId];
            const descriptor = group.descriptors.get(descriptorId);
            if (pendingSet.has(descriptorId)) {
                regenerating.push(descriptorId);
                continue;
            }
            const cached = matchKey ? cachedMatchLookup.get(matchKey) : undefined;
            if (!cached) {
                missing.push(descriptorId);
                continue;
            }
            if (trackStale) {
                stale.push(descriptorId);
                continue;
            }
            const featureTrack = descriptor?.descriptor?.featureKey
                ? cache?.featureTracks?.[descriptor.descriptor.featureKey]
                : undefined;
            const trackProfile = featureTrack?.analysisProfileId ?? cache?.defaultAnalysisProfileId ?? null;
            if (group.analysisProfileId && trackProfile && group.analysisProfileId !== trackProfile) {
                stale.push(descriptorId);
                continue;
            }
        }

        for (const cached of cachedInfos) {
            const isRequested = requested.some((id) => matchKeyById[id] === cached.matchKey);
            if (isRequested) continue;
            if (dismissedSet.has(cached.id)) continue;
            extraneous.push(cached.id);
            const cachedDetail = createDescriptorDetail(cached.descriptor, cache, {
                channelCount: cached.channelCount,
                channelAliases: cached.channelAliases,
                channelLayout: cached.channelLayout,
            });
            if (cachedDetail) {
                descriptorDetails[cached.id] = cachedDetail;
            }
            ownerMap[cached.id] = [];
        }

        const descriptorsCached = cachedInfos.map((info) => info.id);
        const hasIssues = missing.length + stale.length + extraneous.length > 0;
        diffs.push({
            trackRef: group.trackRef,
            audioSourceId: sourceId,
            analysisProfileId: group.analysisProfileId,
            descriptorsRequested: requested,
            descriptorsCached,
            missing,
            stale,
            extraneous,
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
        const descriptors: Record<string, DescriptorInfo> = {};
        for (const entry of intent.descriptors) {
            descriptors[entry.id] = { descriptor: entry.descriptor, matchKey: entry.matchKey };
        }
        const requirements = getFeatureRequirements(intent.elementType);
        const normalizedRequirements = requirements.map((requirement) => {
            const { descriptor } = createFeatureDescriptor({
                feature: requirement.feature,
                bandIndex: requirement.bandIndex ?? undefined,
                calculatorId: requirement.calculatorId ?? undefined,
                profile: requirement.profile ?? undefined,
            });
            return {
                requirement,
                descriptor,
                matchKey: buildDescriptorMatchKey(descriptor),
            };
        });
        const descriptorMatchKeys = new Set(Object.values(descriptors).map((entry) => entry.matchKey));
        const requirementDiagnostics: RequirementDiagnostic[] = normalizedRequirements.map((entry) => ({
            requirement: entry.requirement,
            descriptor: entry.descriptor,
            matchKey: entry.matchKey,
            satisfied: descriptorMatchKeys.has(entry.matchKey),
        }));
        const requirementKeys = new Set(normalizedRequirements.map((entry) => entry.matchKey));
        const unexpectedDescriptors = Object.values(descriptors)
            .map((entry) => entry.matchKey)
            .filter((key) => !requirementKeys.has(key));
        const autoManaged = requirementDiagnostics.length > 0;
        set((state) => ({
            intentsByElement: {
                ...state.intentsByElement,
                [intent.elementId]: {
                    elementId: intent.elementId,
                    elementType: intent.elementType,
                    trackRef: intent.trackRef,
                    analysisProfileId: intent.analysisProfileId,
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
        const bannerVisible = diffs.some((diff) => diff.missing.length + diff.stale.length > 0);
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
    const descriptor = diff.descriptorDetails[descriptorId]?.descriptor;
    return buildDescriptorLabel(descriptor);
}

export function getDiagnosticsPanelState() {
    return useAudioDiagnosticsStore.getState();
}

export type AnalysisHistorySummary = ReturnType<AudioDiagnosticsState['getHistorySummary']>;
