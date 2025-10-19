import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import {
    logSmoothingMigration,
    stripDescriptorArraySmoothing,
    stripDescriptorSmoothing,
} from './removeSmoothingFromDescriptor';
import { migrateDescriptorChannels } from './unifyChannelField';

interface SceneLike {
    elements?: unknown;
    bindings?: unknown;
    runtimeMeta?: { schemaVersion?: number } | null;
    scene?: { elements?: unknown } | null;
}

interface ElementSnapshot {
    id?: string | null;
    type?: string | null;
    config?: Record<string, unknown> | null;
    bindings?: Record<string, unknown> | null;
    children?: unknown;
}

const SMOOTHING_ELEMENT_TYPES = new Set([
    'audioSpectrum',
    'audioVolumeMeter',
    'audioWaveform',
    'audioOscilloscope',
]);

function resolveSmoothingProperty(elementType: string | null | undefined): string | null {
    if (!elementType) return null;
    return SMOOTHING_ELEMENT_TYPES.has(elementType) ? 'smoothing' : null;
}

function normalizeSmoothingValue(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, numeric);
}

function sanitizeDescriptor(entry: unknown): AudioFeatureDescriptor | null {
    const migrated = migrateDescriptorChannels(entry);
    if (migrated && typeof migrated.featureKey === 'string' && migrated.featureKey) {
        return { ...migrated };
    }
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const source = entry as Record<string, unknown>;
    const featureKey = typeof source.featureKey === 'string' && source.featureKey ? source.featureKey : null;
    if (!featureKey) {
        return null;
    }
    const descriptor: AudioFeatureDescriptor = {
        featureKey,
        calculatorId: (source.calculatorId as string | null | undefined) ?? null,
        bandIndex: typeof source.bandIndex === 'number' && Number.isFinite(source.bandIndex)
            ? Math.trunc(source.bandIndex)
            : null,
        channel: (source.channel as number | string | null | undefined) ?? null,
    };
    for (const [key, value] of Object.entries(source)) {
        if (key === 'featureKey' || key === 'calculatorId' || key === 'bandIndex' || key === 'channel') continue;
        if (key === 'smoothing' || key === 'channelAlias' || key === 'channelIndex') continue;
        (descriptor as unknown as Record<string, unknown>)[key] = value;
    }
    return descriptor;
}

function cloneBinding(binding: any): Record<string, unknown> {
    if (!binding || typeof binding !== 'object') {
        return {};
    }
    const result: Record<string, unknown> = { ...binding };
    if (Array.isArray((binding as { value?: unknown }).value)) {
        result.value = [...((binding as { value?: unknown[] }).value ?? [])];
    }
    return result;
}

function migrateBindings(
    elementId: string | null | undefined,
    elementType: string | null | undefined,
    bindings: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    if (!bindings || typeof bindings !== 'object') {
        return bindings ?? null;
    }
    const result: Record<string, unknown> = {};
    let smoothingCandidate: number | null = null;
    for (const [key, rawBinding] of Object.entries(bindings)) {
        if (!rawBinding || typeof rawBinding !== 'object') {
            result[key] = rawBinding;
            continue;
        }
        const binding = cloneBinding(rawBinding);
        const type = (binding as { type?: string }).type;
        if (type === 'constant') {
            const value = (binding as { value?: unknown }).value;
            if (key === 'features') {
                if (Array.isArray(value)) {
                    const { descriptors, smoothingValues } = stripDescriptorArraySmoothing(value);
                    if (smoothingValues.length && smoothingCandidate == null) {
                        smoothingCandidate = smoothingValues.find((entry) => Number.isFinite(entry)) ?? null;
                    }
                    const normalized = descriptors
                        .map((descriptor) => sanitizeDescriptor(descriptor))
                        .filter((descriptor): descriptor is AudioFeatureDescriptor => descriptor != null);
                    binding.value = normalized;
                } else {
                    const { descriptor, smoothing } = stripDescriptorSmoothing(value);
                    if (smoothing != null && smoothingCandidate == null) {
                        smoothingCandidate = smoothing;
                    }
                    binding.value = descriptor ? [sanitizeDescriptor(descriptor)].filter(Boolean) : [];
                }
            } else if (key === 'featureDescriptor') {
                const { descriptor, smoothing } = stripDescriptorSmoothing(value);
                if (descriptor) {
                    const normalized = sanitizeDescriptor(descriptor);
                    if (normalized) {
                        result.features = {
                            type: 'constant',
                            value: [normalized],
                        };
                    } else {
                        result.features = {
                            type: 'constant',
                            value: [],
                        };
                    }
                }
                if (smoothing != null && smoothingCandidate == null) {
                    smoothingCandidate = smoothing;
                }
                continue;
            }
            if (key === resolveSmoothingProperty(elementType)) {
                const normalized = normalizeSmoothingValue((binding as { value?: unknown }).value);
                binding.value = normalized;
            }
        }
        result[key] = binding;
    }
    const smoothingKey = resolveSmoothingProperty(elementType);
    if (smoothingKey) {
        const existing = result[smoothingKey];
        if (existing && typeof existing === 'object' && (existing as { type?: string }).type === 'constant') {
            const normalized = normalizeSmoothingValue((existing as { value?: unknown }).value);
            (existing as { value?: unknown }).value = normalized;
        } else if (smoothingCandidate != null) {
            const normalized = normalizeSmoothingValue(smoothingCandidate);
            result[smoothingKey] = { type: 'constant', value: normalized };
            logSmoothingMigration(elementId, elementType, normalized);
        }
    }
    return result;
}

function migrateElementConfig(
    elementId: string | null | undefined,
    elementType: string | null | undefined,
    config: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    if (!config || typeof config !== 'object') {
        return config ?? null;
    }
    const result: Record<string, unknown> = { ...config };
    let smoothingCandidate: number | null = null;

    if (Array.isArray(result.audioFeatures)) {
        const { descriptors, smoothingValues } = stripDescriptorArraySmoothing(result.audioFeatures);
        if (smoothingValues.length && smoothingCandidate == null) {
            smoothingCandidate = smoothingValues.find((entry) => Number.isFinite(entry)) ?? null;
        }
        delete result.audioFeatures;
        if (!Array.isArray(result.features)) {
            const normalized = descriptors
                .map((descriptor) => sanitizeDescriptor(descriptor))
                .filter((descriptor): descriptor is AudioFeatureDescriptor => descriptor != null);
            if (normalized.length > 0) {
                result.features = normalized;
            }
        }
    }

    if ('featureDescriptor' in result) {
        const { descriptor, smoothing } = stripDescriptorSmoothing(result.featureDescriptor);
        delete result.featureDescriptor;
        if (descriptor && !Array.isArray(result.features)) {
            const normalized = sanitizeDescriptor(descriptor);
            result.features = normalized ? [normalized] : [];
        }
        if (smoothing != null && smoothingCandidate == null) {
            smoothingCandidate = smoothing;
        }
    }

    const smoothingKey = resolveSmoothingProperty(elementType);
    if (smoothingKey) {
        if (smoothingKey in result) {
            result[smoothingKey] = normalizeSmoothingValue(result[smoothingKey]);
        } else if (smoothingCandidate != null) {
            const normalized = normalizeSmoothingValue(smoothingCandidate);
            result[smoothingKey] = normalized;
            logSmoothingMigration(elementId, elementType, normalized);
        }
    }

    return result;
}

function migrateElement(element: ElementSnapshot): ElementSnapshot {
    const migrated: ElementSnapshot = { ...element };
    const id = typeof element.id === 'string' ? element.id : null;
    const type = typeof element.type === 'string' ? element.type : null;

    migrated.config = migrateElementConfig(id, type, element.config ?? null);
    migrated.bindings = migrateBindings(id, type, element.bindings ?? null);

    if (Array.isArray(element.children)) {
        migrated.children = element.children.map((child: unknown) => {
            if (!child || typeof child !== 'object') return child;
            const snapshot: ElementSnapshot = child as ElementSnapshot;
            return migrateElement(snapshot);
        });
    }

    return migrated;
}

function buildElementSnapshot(entry: unknown): ElementSnapshot | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const source = entry as Record<string, unknown>;
    const snapshot: ElementSnapshot = {
        id: typeof source.id === 'string' ? source.id : null,
        type: typeof source.type === 'string' ? source.type : null,
        config: source.config && typeof source.config === 'object' ? (source.config as Record<string, unknown>) : null,
        bindings: source.bindings && typeof source.bindings === 'object' ? (source.bindings as Record<string, unknown>) : null,
        children: Array.isArray(source.children) ? source.children : undefined,
    };
    return snapshot;
}

function migrateElementCollection(collection: unknown): unknown {
    if (!Array.isArray(collection)) {
        return collection;
    }
    return collection.map((entry) => {
        const snapshot = buildElementSnapshot(entry);
        if (!snapshot) return entry;
        const migrated = migrateElement(snapshot);
        return { ...entry, ...migrated };
    });
}

function migrateBindingsIndex(
    scene: SceneLike,
    migratedElements: Record<string, { type?: string | null }>,
): Record<string, unknown> | undefined {
    const bindings = scene.bindings;
    if (!bindings || typeof bindings !== 'object') {
        return undefined;
    }
    const source = bindings as { byElement?: Record<string, Record<string, unknown>> };
    if (!source.byElement || typeof source.byElement !== 'object') {
        return bindings as Record<string, unknown>;
    }
    const nextByElement: Record<string, Record<string, unknown>> = {};
    for (const [elementId, bindingMap] of Object.entries(source.byElement)) {
        const elementType = migratedElements[elementId]?.type ?? null;
        const migrated = migrateBindings(elementId, elementType, bindingMap);
        if (migrated) {
            nextByElement[elementId] = migrated;
        }
    }
    return {
        ...bindings,
        byElement: nextByElement,
    } as Record<string, unknown>;
}

function collectElementMetadata(scene: SceneLike): Record<string, { type?: string | null }> {
    const map: Record<string, { type?: string | null }> = {};
    const register = (entry: unknown) => {
        const snapshot = buildElementSnapshot(entry);
        if (!snapshot || !snapshot.id) return;
        if (!map[snapshot.id]) {
            map[snapshot.id] = { type: snapshot.type ?? null };
        } else if (snapshot.type) {
            map[snapshot.id].type = snapshot.type;
        }
        if (Array.isArray(snapshot.children)) {
            snapshot.children.forEach(register);
        }
    };
    const sources: unknown[] = [];
    if (Array.isArray((scene as any).elements)) {
        sources.push(...((scene as any).elements as unknown[]));
    }
    if (scene.scene && Array.isArray(scene.scene.elements)) {
        sources.push(...(scene.scene.elements as unknown[]));
    }
    if (scene.elements && typeof scene.elements === 'object' && !Array.isArray(scene.elements)) {
        for (const [id, entry] of Object.entries(scene.elements as Record<string, unknown>)) {
            if (!map[id]) {
                map[id] = { type: typeof (entry as { type?: string }).type === 'string' ? (entry as { type?: string }).type : null };
            }
        }
    }
    sources.forEach(register);
    return map;
}

export function migrateSceneAudioSystemV4<T extends SceneLike>(sceneState: T): T {
    if (!sceneState || typeof sceneState !== 'object') {
        return sceneState;
    }
    const migratedElementsMeta = collectElementMetadata(sceneState);
    const migrated: Record<string, unknown> = {
        ...(sceneState as unknown as Record<string, unknown>),
    };

    if (Array.isArray((sceneState as any).elements)) {
        migrated.elements = migrateElementCollection((sceneState as any).elements);
    }

    if (sceneState.scene && typeof sceneState.scene === 'object') {
        migrated.scene = {
            ...sceneState.scene,
            elements: migrateElementCollection(sceneState.scene.elements),
        } as SceneLike['scene'];
    }

    const bindings = migrateBindingsIndex(sceneState, migratedElementsMeta);
    if (bindings) {
        migrated.bindings = bindings;
    }

    const runtimeMeta = sceneState.runtimeMeta;
    if (runtimeMeta && typeof runtimeMeta === 'object') {
        migrated.runtimeMeta = { ...runtimeMeta, schemaVersion: 4 };
    }

    return migrated as T;
}

function collectDescriptorEntries(source: unknown): Record<string, unknown>[] {
    if (!source || typeof source !== 'object') {
        return [];
    }
    const descriptors: Record<string, unknown>[] = [];
    const record = source as Record<string, unknown>;
    for (const value of Object.values(record)) {
        if (!value || typeof value !== 'object') continue;
        const type = (value as { type?: string }).type;
        if (type === 'constant') {
            const constantValue = (value as { value?: unknown }).value;
            if (Array.isArray(constantValue)) {
                for (const entry of constantValue) {
                    if (entry && typeof entry === 'object') {
                        descriptors.push(entry as Record<string, unknown>);
                    }
                }
            } else if (constantValue && typeof constantValue === 'object') {
                descriptors.push(constantValue as Record<string, unknown>);
            }
        }
    }
    return descriptors;
}

function extractSmoothingFromConfig(config: Record<string, unknown> | null | undefined, key: string | null): number | null {
    if (!config || !key) return null;
    const value = config[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
        return normalizeSmoothingValue(value);
    }
    if (value != null) {
        return normalizeSmoothingValue(value);
    }
    return null;
}

function extractSmoothingFromBindings(bindings: Record<string, unknown> | null | undefined, key: string | null): number | null {
    if (!bindings || !key) return null;
    const binding = bindings[key];
    if (!binding || typeof binding !== 'object') {
        return null;
    }
    if ((binding as { type?: string }).type !== 'constant') {
        return null;
    }
    const value = (binding as { value?: unknown }).value;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return normalizeSmoothingValue(value);
    }
    if (value != null) {
        return normalizeSmoothingValue(value);
    }
    return null;
}

function collectDescriptorSmoothing(values: Record<string, unknown>[] | null | undefined): number[] {
    if (!values) return [];
    const result: number[] = [];
    for (const descriptor of values) {
        if (!descriptor || typeof descriptor !== 'object') continue;
        const smoothing = (descriptor as { smoothing?: unknown }).smoothing;
        if (typeof smoothing === 'number' && Number.isFinite(smoothing)) {
            result.push(smoothing);
        }
    }
    return result;
}

function gatherDescriptorArrays(entry: ElementSnapshot): Record<string, unknown>[] {
    const descriptors: Record<string, unknown>[] = [];
    if (entry.config && Array.isArray((entry.config as Record<string, unknown>).audioFeatures)) {
        descriptors.push(...((entry.config as Record<string, unknown>).audioFeatures as Record<string, unknown>[]));
    }
    if (entry.bindings) {
        descriptors.push(...collectDescriptorEntries(entry.bindings));
    }
    return descriptors;
}

function collectElementSnapshots(state: unknown): Record<string, ElementSnapshot> {
    const result: Record<string, ElementSnapshot> = {};
    const visit = (entry: unknown) => {
        const snapshot = buildElementSnapshot(entry);
        if (!snapshot || !snapshot.id) return;
        const existing = result[snapshot.id] ?? {};
        result[snapshot.id] = {
            id: snapshot.id,
            type: snapshot.type ?? existing.type ?? null,
            config: snapshot.config ?? existing.config ?? null,
            bindings: snapshot.bindings ?? existing.bindings ?? null,
            children: snapshot.children,
        };
        if (Array.isArray(snapshot.children)) {
            snapshot.children.forEach(visit);
        }
    };
    if (state && typeof state === 'object') {
        const root = state as SceneLike;
        if (Array.isArray((root as any).elements)) {
            (root as any).elements.forEach(visit);
        }
        if (root.scene && Array.isArray(root.scene.elements)) {
            root.scene.elements.forEach(visit);
        }
        if (root.bindings && typeof root.bindings === 'object') {
            const byElement = (root.bindings as { byElement?: Record<string, unknown> }).byElement;
            if (byElement && typeof byElement === 'object') {
                for (const [id, bindings] of Object.entries(byElement)) {
                    const existing = result[id] ?? { id };
                    result[id] = {
                        ...existing,
                        id,
                        bindings: bindings && typeof bindings === 'object' ? (bindings as Record<string, unknown>) : existing.bindings,
                    };
                }
            }
        }
        if (root.elements && typeof root.elements === 'object' && !Array.isArray(root.elements)) {
            for (const [id, entry] of Object.entries(root.elements as Record<string, unknown>)) {
                const existing = result[id] ?? { id };
                result[id] = {
                    ...existing,
                    id,
                    type: typeof (entry as { type?: string }).type === 'string' ? (entry as { type?: string }).type : existing.type,
                };
            }
        }
    }
    return result;
}

export function verifySceneAudioSystemV4(before: unknown, after: unknown): boolean {
    const beforeSnapshots = collectElementSnapshots(before);
    const afterSnapshots = collectElementSnapshots(after);

    for (const snapshot of Object.values(afterSnapshots)) {
        if (snapshot.config && 'audioFeatures' in snapshot.config) {
            return false;
        }
        const descriptors = gatherDescriptorArrays(snapshot);
        for (const descriptor of descriptors) {
            if (descriptor && typeof descriptor === 'object' && 'smoothing' in descriptor) {
                return false;
            }
        }
    }

    for (const [elementId, snapshot] of Object.entries(beforeSnapshots)) {
        const descriptors = gatherDescriptorArrays(snapshot);
        if (!descriptors.length) continue;
        const smoothingValues = collectDescriptorSmoothing(descriptors);
        if (!smoothingValues.length) continue;
        const afterSnapshot = afterSnapshots[elementId];
        const elementType = afterSnapshot?.type ?? snapshot.type ?? null;
        const smoothingKey = resolveSmoothingProperty(elementType);
        if (!smoothingKey) {
            continue;
        }
        const smoothingFromConfig = extractSmoothingFromConfig(afterSnapshot?.config ?? null, smoothingKey);
        const smoothingFromBindings = extractSmoothingFromBindings(afterSnapshot?.bindings ?? null, smoothingKey);
        if (smoothingFromConfig == null && smoothingFromBindings == null) {
            return false;
        }
    }

    return true;
}
