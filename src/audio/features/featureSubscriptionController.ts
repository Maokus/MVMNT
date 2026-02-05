import {
    publishAnalysisIntent,
    clearAnalysisIntent,
    buildDescriptorIdentityKey,
    buildDescriptorMatchKey,
} from './analysisIntents';
import { createFeatureDescriptor, type FeatureDescriptorBuildResult } from './descriptorBuilder';
import type { AudioFeatureAnalysisProfileDescriptor, AudioFeatureDescriptor } from './audioFeatureTypes';
import type { AudioFeatureRequirement } from '@audio/audioElementMetadata';

export interface SceneFeatureElementRef {
    id: string | null;
    type?: string;
}

type DescriptorSourceKey = 'static' | 'explicit' | 'adHoc';

interface DescriptorContribution {
    descriptor: AudioFeatureDescriptor;
    profile: string | null;
}

interface DescriptorSourceState {
    entries: Map<string, DescriptorContribution>;
    profileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

interface AggregatedDescriptorState {
    descriptors: AudioFeatureDescriptor[];
    profile: string | null;
    profileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null;
}

const SOURCE_PRIORITY: DescriptorSourceKey[] = ['explicit', 'adHoc', 'static'];

const controllerRegistry = new WeakMap<object, FeatureSubscriptionController>();
const controllerStrongRefs = new Set<FeatureSubscriptionController>();
const controllerElements = new Map<FeatureSubscriptionController, object>();
let fallbackElementIds = new WeakMap<object, string>();
let fallbackElementIdCounter = 0;

function slugifyElementType(value: string): string {
    const sanitized = value.trim().toLowerCase();
    const slug = sanitized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug.length ? slug : 'unknown';
}

function getOrCreateFallbackElementId(element: object, elementType: string): string {
    const existing = fallbackElementIds.get(element);
    if (existing) {
        return existing;
    }
    fallbackElementIdCounter += 1;
    const slug = slugifyElementType(elementType);
    const generated = `__feature:${slug}:${fallbackElementIdCounter.toString(36)}`;
    fallbackElementIds.set(element, generated);
    return generated;
}

export function normalizeTrackId(trackId: string | null | undefined): string | null {
    if (typeof trackId !== 'string') {
        return null;
    }
    const trimmed = trackId.trim();
    return trimmed.length ? trimmed : null;
}

function resolveElementIdentity(element: SceneFeatureElementRef | object): { id: string | null; type: string } {
    if (element && typeof element === 'object') {
        const rawId = (element as SceneFeatureElementRef).id;
        const id = typeof rawId === 'string' && rawId.trim().length ? rawId.trim() : null;
        const rawType = (element as SceneFeatureElementRef).type;
        let resolvedType: string;
        if (typeof rawType === 'string' && rawType.trim().length) {
            resolvedType = rawType.trim();
        } else {
            const ctorName = (element as any)?.constructor?.name;
            resolvedType = typeof ctorName === 'string' && ctorName.length ? ctorName : 'unknown';
        }

        if (id) {
            fallbackElementIds.delete(element as object);
            return { id, type: resolvedType };
        }

        if (typeof rawType === 'string' && rawType.trim().length) {
            const fallbackId = getOrCreateFallbackElementId(element as object, resolvedType);
            return { id: fallbackId, type: resolvedType };
        }

        return { id: null, type: resolvedType };
    }
    return { id: null, type: 'unknown' };
}

function mergeProfileRegistryDelta(
    target: Record<string, AudioFeatureAnalysisProfileDescriptor>,
    source: Record<string, AudioFeatureAnalysisProfileDescriptor>
): void {
    for (const [key, descriptor] of Object.entries(source)) {
        if (!target[key]) {
            target[key] = { ...descriptor };
        }
    }
}

function buildDescriptorEntryFromRequirement(requirement: AudioFeatureRequirement): FeatureDescriptorBuildResult {
    return createFeatureDescriptor({
        feature: requirement.feature,
        bandIndex: requirement.bandIndex ?? undefined,
        calculatorId: requirement.calculatorId ?? undefined,
        profile: requirement.profile ?? undefined,
        profileParams: requirement.profileParams ?? undefined,
    });
}

export class FeatureSubscriptionController {
    private readonly element: SceneFeatureElementRef | object;
    private normalizedTrackId: string | null = null;
    private disposed = false;
    private forceNextPublish = false;

    private sources = new Map<DescriptorSourceKey, DescriptorSourceState>();
    private currentDescriptors: AudioFeatureDescriptor[] = [];
    private currentProfile: string | null = null;
    private currentProfileRegistryDelta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null = null;

    constructor(element: SceneFeatureElementRef | object) {
        this.element = element;
    }

    updateTrack(trackId: string | null | undefined): string | null {
        this.ensureNotDisposed();
        const normalized = normalizeTrackId(trackId);
        if (normalized === this.normalizedTrackId) {
            return this.normalizedTrackId;
        }

        this.normalizedTrackId = normalized;
        this.forceNextPublish = true;

        if (!normalized) {
            // Clear dynamic sources when the track becomes unset.
            this.sources.delete('explicit');
            this.sources.delete('adHoc');
        }

        this.flush();
        return this.normalizedTrackId;
    }

    setStaticRequirements(requirements: AudioFeatureRequirement[]): void {
        this.ensureNotDisposed();
        if (!requirements.length) {
            this.sources.delete('static');
            this.flush();
            return;
        }

        const entries = new Map<string, DescriptorContribution>();
        for (const requirement of requirements) {
            const { descriptor, profile } = buildDescriptorEntryFromRequirement(requirement);
            if (!descriptor || !descriptor.featureKey) {
                continue;
            }
            const key = buildDescriptorIdentityKey(descriptor);
            entries.set(key, {
                descriptor,
                profile: descriptor.analysisProfileId ?? profile,
            });
        }
        this.sources.set('static', { entries, profileRegistryDelta: null });
        this.flush();
    }

    registerAdHocDescriptor(descriptor: AudioFeatureDescriptor, profile: string | null): AudioFeatureDescriptor | null {
        this.ensureNotDisposed();
        if (!descriptor || !descriptor.featureKey) {
            return null;
        }
        if (!this.normalizedTrackId) {
            return null;
        }
        const matchKey = buildDescriptorMatchKey(descriptor);

        const explicitSource = this.sources.get('explicit');
        if (explicitSource) {
            for (const entry of explicitSource.entries.values()) {
                if (buildDescriptorMatchKey(entry.descriptor) === matchKey) {
                    return entry.descriptor;
                }
            }
        }

        const state = this.getOrCreateSource('adHoc');
        const identityKey = buildDescriptorIdentityKey(descriptor);
        const existing = state.entries.get(identityKey);
        if (existing) {
            existing.descriptor = descriptor;
            if (!existing.profile && profile) {
                existing.profile = profile;
            }
            this.flush();
            return existing.descriptor;
        }

        for (const [existingKey, entry] of state.entries.entries()) {
            if (buildDescriptorMatchKey(entry.descriptor) !== matchKey) {
                continue;
            }
            const existingDescriptor = entry.descriptor;
            const existingHasOverrides =
                !!existingDescriptor.profileOverrides || !!existingDescriptor.profileOverridesHash;
            const newHasOverrides = !!descriptor.profileOverrides || !!descriptor.profileOverridesHash;
            const hasDifferentProfile = entry.profile !== profile;
            if (newHasOverrides || hasDifferentProfile || !existingHasOverrides) {
                state.entries.delete(existingKey);
                state.entries.set(identityKey, { descriptor, profile });
                this.flush();
                return descriptor;
            }
            return existingDescriptor;
        }

        state.entries.set(identityKey, { descriptor, profile });
        this.flush();
        return descriptor;
    }

    resolveDescriptorForSampling(descriptor: AudioFeatureDescriptor, profile: string | null): AudioFeatureDescriptor {
        this.ensureNotDisposed();
        if (!descriptor || !descriptor.featureKey || !this.normalizedTrackId) {
            return descriptor;
        }

        const matchKey = buildDescriptorMatchKey(descriptor);

        const explicitSource = this.sources.get('explicit');
        if (explicitSource) {
            for (const entry of explicitSource.entries.values()) {
                if (buildDescriptorMatchKey(entry.descriptor) === matchKey) {
                    return entry.descriptor;
                }
            }
        }

        const adHocSource = this.sources.get('adHoc');
        if (adHocSource) {
            for (const [existingKey, entry] of adHocSource.entries.entries()) {
                if (buildDescriptorMatchKey(entry.descriptor) !== matchKey) {
                    continue;
                }
                const existingDescriptor = entry.descriptor;
                const existingHasOverrides =
                    !!existingDescriptor.profileOverrides || !!existingDescriptor.profileOverridesHash;
                const newHasOverrides = !!descriptor.profileOverrides || !!descriptor.profileOverridesHash;
                const hasDifferentProfile = entry.profile !== profile;
                if (newHasOverrides || hasDifferentProfile || !existingHasOverrides) {
                    const identityKey = buildDescriptorIdentityKey(descriptor);
                    adHocSource.entries.delete(existingKey);
                    adHocSource.entries.set(identityKey, { descriptor, profile });
                    this.flush();
                    return descriptor;
                }
                return existingDescriptor;
            }
        }

        return this.registerAdHocDescriptor(descriptor, profile) ?? descriptor;
    }

    syncExplicitDescriptors(
        descriptors: AudioFeatureDescriptor[],
        profile?: string | null,
        profileRegistryDelta?: Record<string, AudioFeatureAnalysisProfileDescriptor> | null
    ): void {
        this.ensureNotDisposed();
        if (!descriptors.length) {
            this.sources.delete('explicit');
            this.flush();
            return;
        }

        const entries = new Map<string, DescriptorContribution>();
        for (const descriptor of descriptors) {
            if (!descriptor || !descriptor.featureKey) {
                continue;
            }
            const key = buildDescriptorIdentityKey(descriptor);
            const resolvedProfile = descriptor.analysisProfileId ?? profile ?? null;
            entries.set(key, { descriptor, profile: resolvedProfile });
        }
        this.sources.set('explicit', {
            entries,
            profileRegistryDelta: profileRegistryDelta ?? null,
        });
        this.flush();
    }

    getActiveTrackId(): string | null {
        return this.normalizedTrackId;
    }

    getSubscriptionSnapshot(): AudioFeatureDescriptor[] {
        return [...this.currentDescriptors];
    }

    clear(trackId?: string | null): void {
        this.ensureNotDisposed();
        const normalized = normalizeTrackId(trackId);
        if (normalized && normalized !== this.normalizedTrackId) {
            return;
        }
        this.sources.clear();
        this.normalizedTrackId = null;
        this.flush();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.clear();
        this.disposed = true;
    }

    private ensureNotDisposed(): void {
        if (this.disposed) {
            throw new Error('FeatureSubscriptionController has been disposed');
        }
    }

    private getOrCreateSource(key: DescriptorSourceKey): DescriptorSourceState {
        let state = this.sources.get(key);
        if (!state) {
            state = {
                entries: new Map(),
                profileRegistryDelta: null,
            };
            this.sources.set(key, state);
        }
        return state;
    }

    private aggregateDescriptors(): AggregatedDescriptorState {
        const aggregated = new Map<string, AudioFeatureDescriptor>();
        let profile: string | null = null;
        const registryAggregate: Record<string, AudioFeatureAnalysisProfileDescriptor> = {};
        let hasRegistryDelta = false;
        const explicitSource = this.sources.get('explicit');
        const hasExplicitEntries = !!explicitSource && explicitSource.entries.size > 0;

        for (const key of SOURCE_PRIORITY) {
            if (hasExplicitEntries && key === 'static') {
                continue;
            }
            const source = this.sources.get(key);
            if (!source) {
                continue;
            }

            if (source.profileRegistryDelta) {
                mergeProfileRegistryDelta(registryAggregate, source.profileRegistryDelta);
                hasRegistryDelta = true;
            }

            for (const entry of source.entries.values()) {
                const descriptor = entry.descriptor;
                if (!descriptor || !descriptor.featureKey) {
                    continue;
                }
                const identityKey = buildDescriptorIdentityKey(descriptor);
                const existing = aggregated.get(identityKey);
                if (!existing) {
                    aggregated.set(identityKey, descriptor);
                    if (!profile && entry.profile) {
                        profile = entry.profile;
                    }
                    if (descriptor.profileRegistryDelta) {
                        mergeProfileRegistryDelta(registryAggregate, descriptor.profileRegistryDelta);
                        hasRegistryDelta = true;
                    }
                    continue;
                }

                if (!profile && entry.profile) {
                    profile = entry.profile;
                }

                if (descriptor.profileOverrides && !existing.profileOverrides) {
                    existing.profileOverrides = { ...descriptor.profileOverrides };
                    existing.profileOverridesHash =
                        descriptor.profileOverridesHash ?? existing.profileOverridesHash ?? null;
                }

                if (!existing.analysisProfileId && descriptor.analysisProfileId) {
                    existing.analysisProfileId = descriptor.analysisProfileId;
                }

                if (!existing.requestedAnalysisProfileId && descriptor.requestedAnalysisProfileId) {
                    existing.requestedAnalysisProfileId = descriptor.requestedAnalysisProfileId;
                }

                if (descriptor.profileRegistryDelta) {
                    existing.profileRegistryDelta = {
                        ...(existing.profileRegistryDelta ?? {}),
                        ...descriptor.profileRegistryDelta,
                    };
                    mergeProfileRegistryDelta(registryAggregate, descriptor.profileRegistryDelta);
                    hasRegistryDelta = true;
                }
            }
        }

        return {
            descriptors: Array.from(aggregated.values()),
            profile,
            profileRegistryDelta: hasRegistryDelta ? registryAggregate : null,
        };
    }

    private flush(): void {
        if (!this.normalizedTrackId) {
            this.forceNextPublish = false;
            if (
                this.currentDescriptors.length ||
                this.currentProfile !== null ||
                (this.currentProfileRegistryDelta && Object.keys(this.currentProfileRegistryDelta).length)
            ) {
                this.currentDescriptors = [];
                this.currentProfile = null;
                this.currentProfileRegistryDelta = null;
                this.clearIntent();
            }
            return;
        }

        const { descriptors, profile, profileRegistryDelta } = this.aggregateDescriptors();
        const profileOrNull = profile ?? null;
        const registryOrNull = profileRegistryDelta ?? null;
        const descriptorsChanged = this.haveDescriptorsChanged(descriptors);
        const profileChanged = this.currentProfile !== profileOrNull;
        const registryChanged = this.registryDeltaChanged(this.currentProfileRegistryDelta, registryOrNull);

        if (!descriptors.length) {
            if (
                this.currentDescriptors.length ||
                this.currentProfile !== null ||
                (this.currentProfileRegistryDelta && Object.keys(this.currentProfileRegistryDelta).length)
            ) {
                this.currentDescriptors = [];
                this.currentProfile = null;
                this.currentProfileRegistryDelta = null;
                this.clearIntent();
            }
            this.forceNextPublish = false;
            return;
        }

        if (!descriptorsChanged && !profileChanged && !registryChanged && !this.forceNextPublish) {
            return;
        }

        this.currentDescriptors = descriptors.slice();
        this.currentProfile = profileOrNull;
        this.currentProfileRegistryDelta = registryOrNull ? { ...registryOrNull } : null;
        this.forceNextPublish = false;

        const identity = resolveElementIdentity(this.element);
        if (!identity.id) {
            return;
        }

        publishAnalysisIntent(identity.id, identity.type, this.normalizedTrackId, descriptors, {
            profile: profileOrNull ?? undefined,
            profileRegistryDelta: registryOrNull ?? undefined,
        });
    }

    private clearIntent(): void {
        const identity = resolveElementIdentity(this.element);
        if (identity.id) {
            clearAnalysisIntent(identity.id);
        }
    }

    private haveDescriptorsChanged(next: AudioFeatureDescriptor[]): boolean {
        if (this.currentDescriptors.length !== next.length) {
            return true;
        }
        for (let index = 0; index < next.length; index += 1) {
            const prevKey = buildDescriptorIdentityKey(this.currentDescriptors[index]);
            const nextKey = buildDescriptorIdentityKey(next[index]);
            if (prevKey !== nextKey) {
                return true;
            }
        }
        return false;
    }

    private registryDeltaChanged(
        prev: Record<string, AudioFeatureAnalysisProfileDescriptor> | null,
        next: Record<string, AudioFeatureAnalysisProfileDescriptor> | null
    ): boolean {
        if (!prev && !next) {
            return false;
        }
        if (!prev || !next) {
            return true;
        }
        return buildRegistrySignature(prev) !== buildRegistrySignature(next);
    }
}

export function getFeatureSubscriptionController(
    element: SceneFeatureElementRef | object
): FeatureSubscriptionController {
    if (!element || typeof element !== 'object') {
        throw new Error('FeatureSubscriptionController requires an object reference');
    }
    const key = element as object;
    let controller = controllerRegistry.get(key);
    if (!controller) {
        controller = new FeatureSubscriptionController(element);
        controllerRegistry.set(key, controller);
        controllerStrongRefs.add(controller);
        controllerElements.set(controller, key);
    }
    return controller;
}

export function peekFeatureSubscriptionController(
    element: SceneFeatureElementRef | object
): FeatureSubscriptionController | null {
    if (!element || typeof element !== 'object') {
        return null;
    }
    return controllerRegistry.get(element as object) ?? null;
}

export function releaseFeatureSubscriptionController(element: SceneFeatureElementRef | object): void {
    if (!element || typeof element !== 'object') {
        return;
    }
    const key = element as object;
    const controller = controllerRegistry.get(key);
    if (controller) {
        controller.dispose();
        controllerRegistry.delete(key);
        controllerStrongRefs.delete(controller);
        controllerElements.delete(controller);
    }
}

export function resetFeatureSubscriptionControllersForTests(): void {
    for (const controller of controllerStrongRefs) {
        const element = controllerElements.get(controller);
        if (element) {
            controllerRegistry.delete(element);
        }
        controllerElements.delete(controller);
        controller.dispose();
    }
    controllerStrongRefs.clear();
    controllerElements.clear();
    fallbackElementIds = new WeakMap();
    fallbackElementIdCounter = 0;
}

function buildRegistrySignature(delta: Record<string, AudioFeatureAnalysisProfileDescriptor> | null): string {
    if (!delta || !Object.keys(delta).length) {
        return 'null';
    }
    const entries = Object.keys(delta)
        .sort()
        .map((key) => `${key}:${stableStringify(delta[key])}`);
    return entries.join('|');
}

function stableStringify(value: unknown): string {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return 'null';
        }
        if (Object.is(value, -0)) {
            return '0';
        }
        return value.toString();
    }
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
        return `{${entries.join(',')}}`;
    }
    return 'null';
}
