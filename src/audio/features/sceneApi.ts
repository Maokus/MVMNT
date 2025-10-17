import type { AudioFeatureDescriptor } from './audioFeatureTypes';
import {
    buildDescriptorId,
    buildDescriptorMatchKey,
    clearAnalysisIntent,
    publishAnalysisIntent,
} from './analysisIntents';
import {
    createFeatureDescriptor,
    type FeatureDescriptorBuildResult,
    type FeatureDescriptorBuilderOptions,
    type FeatureDescriptorUpdateOptions,
} from './descriptorBuilder';
import { sampleFeatureFrame } from '@core/scene/elements/audioFeatureUtils';
import type { AudioFeatureFrameSample } from '@state/selectors/audioFeatureSelectors';

export interface SceneFeatureElementRef {
    id: string | null;
    type?: string;
}

export type FeatureInput = string | AudioFeatureDescriptor;

export interface FeatureOptions {
    channel?: number | string | null;
    smoothing?: number | null;
    bandIndex?: number | null;
    calculatorId?: string | null;
    profile?: string | null;
}

export interface FeatureDataMetadata {
    descriptor: AudioFeatureDescriptor;
    frame: AudioFeatureFrameSample;
}

export interface FeatureDataResult {
    values: number[];
    metadata: FeatureDataMetadata;
}

interface DescriptorEntry {
    descriptor: AudioFeatureDescriptor;
    id: string;
    profile: string | null;
}

interface ElementIntentState {
    trackId: string;
    descriptors: Map<string, DescriptorEntry>;
}

let elementStates = new WeakMap<object, ElementIntentState>();

function normalizeTrackId(trackId: string | null | undefined): string | null {
    if (typeof trackId !== 'string') return null;
    const trimmed = trackId.trim();
    return trimmed.length ? trimmed : null;
}

function resolveElementIdentity(element: SceneFeatureElementRef | object): { id: string | null; type: string } {
    if (element && typeof element === 'object') {
        const rawId = (element as SceneFeatureElementRef).id;
        const id = typeof rawId === 'string' && rawId.trim().length ? rawId.trim() : null;
        const rawType = (element as SceneFeatureElementRef).type;
        if (typeof rawType === 'string' && rawType.trim().length) {
            return { id, type: rawType.trim() };
        }
        const ctorName = (element as any)?.constructor?.name;
        return { id, type: typeof ctorName === 'string' && ctorName.length ? ctorName : 'unknown' };
    }
    return { id: null, type: 'unknown' };
}

function buildDescriptor(
    feature: FeatureInput,
    options?: FeatureOptions,
): FeatureDescriptorBuildResult {
    if (typeof feature === 'string') {
        const builderOptions: FeatureDescriptorBuilderOptions = {
            feature,
            channel: options?.channel ?? undefined,
            smoothing: options?.smoothing ?? undefined,
            bandIndex: options?.bandIndex ?? undefined,
            calculatorId: options?.calculatorId ?? undefined,
            profile: options?.profile ?? undefined,
        };
        return createFeatureDescriptor(builderOptions);
    }
    const updateOptions: FeatureDescriptorUpdateOptions | undefined = options
        ? {
              channel: options.channel,
              smoothing: options.smoothing,
              bandIndex: options.bandIndex,
              calculatorId: options.calculatorId,
              profile: options.profile,
          }
        : undefined;
    return createFeatureDescriptor(feature, updateOptions);
}

function publishIfNeeded(
    element: SceneFeatureElementRef | object,
    state: ElementIntentState,
    identity: { id: string | null; type: string },
): void {
    if (!identity.id) {
        return;
    }
    const descriptors = Array.from(state.descriptors.values());
    if (!descriptors.length) {
        clearAnalysisIntent(identity.id);
        return;
    }
    const profile = descriptors.find((entry) => typeof entry.profile === 'string')?.profile ?? null;
    publishAnalysisIntent(
        identity.id,
        identity.type,
        state.trackId,
        descriptors.map((entry) => entry.descriptor),
        profile ? { profile } : undefined,
    );
}

function upsertDescriptorEntry(state: ElementIntentState, entry: DescriptorEntry): boolean {
    const matchKey = buildDescriptorMatchKey(entry.descriptor);
    const existing = state.descriptors.get(matchKey);
    if (!existing) {
        state.descriptors.set(matchKey, entry);
        return true;
    }
    if (existing.id !== entry.id || existing.profile !== entry.profile) {
        state.descriptors.set(matchKey, entry);
        return true;
    }
    return false;
}

function resolveOptionsAndTime(
    optionsOrTime?: FeatureOptions | number | null,
    maybeTime?: number,
): { options: FeatureOptions | undefined; time: number } {
    if (typeof optionsOrTime === 'number' || optionsOrTime == null) {
        return {
            options: undefined,
            time: typeof optionsOrTime === 'number' ? optionsOrTime : 0,
        };
    }
    return {
        options: optionsOrTime,
        time: typeof maybeTime === 'number' ? maybeTime : 0,
    };
}

export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    time: number,
): FeatureDataResult | null;
export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    options: FeatureOptions | null | undefined,
    time: number,
): FeatureDataResult | null;
export function getFeatureData(
    element: SceneFeatureElementRef | object,
    trackId: string | null | undefined,
    feature: FeatureInput,
    optionsOrTime?: FeatureOptions | number | null,
    maybeTime?: number,
): FeatureDataResult | null {
    const { options, time } = resolveOptionsAndTime(optionsOrTime, maybeTime);
    const normalizedTrackId = normalizeTrackId(trackId);
    const identity = resolveElementIdentity(element);

    if (!normalizedTrackId) {
        clearFeatureData(element);
        return null;
    }

    const { descriptor, profile } = buildDescriptor(feature, options);
    const descriptorId = buildDescriptorId(descriptor);

    let state = elementStates.get(element as object);
    let publishNeeded = false;

    if (!state) {
        state = {
            trackId: normalizedTrackId,
            descriptors: new Map(),
        };
        elementStates.set(element as object, state);
        publishNeeded = true;
    } else if (state.trackId !== normalizedTrackId) {
        state.trackId = normalizedTrackId;
        state.descriptors.clear();
        publishNeeded = true;
    }

    if (upsertDescriptorEntry(state, { descriptor, id: descriptorId, profile })) {
        publishNeeded = true;
    }

    if (publishNeeded) {
        publishIfNeeded(element, state, identity);
    }

    const sample = sampleFeatureFrame(normalizedTrackId, descriptor, time);
    if (!sample) {
        return null;
    }

    return {
        values: sample.values,
        metadata: {
            descriptor,
            frame: sample,
        },
    };
}

export function clearFeatureData(
    element: SceneFeatureElementRef | object,
    trackId?: string | null,
): void {
    const state = elementStates.get(element as object);
    if (!state) {
        return;
    }
    const normalized = normalizeTrackId(trackId);
    if (normalized && state.trackId !== normalized) {
        return;
    }
    elementStates.delete(element as object);
    const identity = resolveElementIdentity(element);
    if (identity.id) {
        clearAnalysisIntent(identity.id);
    }
}

export function resetSceneFeatureStateForTests(): void {
    elementStates = new WeakMap();
}
