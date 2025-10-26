import { migrateSceneAudioSystemV4 } from './audioSystemV4';
import { migrateDescriptorChannels } from './unifyChannelField';
import { normalizeChannelSelectorInput } from '@core/scene/elements/audioFeatureUtils';

type MaybeRecord = Record<string, unknown>;

type ChannelSelectorValue = string | number;

interface SceneLike {
    elements?: unknown;
    scene?: { elements?: unknown; bindings?: unknown } | null;
    bindings?: { byElement?: Record<string, unknown> | null } | null;
    runtimeMeta?: { schemaVersion?: number } | null;
}

interface ElementSnapshot {
    id: string | null;
    type: string | null;
    source: MaybeRecord;
}

const CHANNEL_SELECTOR_ELEMENT_TYPES = new Set(['audioSpectrum', 'audioVolumeMeter', 'audioLockedOscilloscope']);

function isObject(value: unknown): value is MaybeRecord {
    return Boolean(value && typeof value === 'object');
}

function isDescriptorLike(value: unknown): value is MaybeRecord {
    if (!isObject(value)) return false;
    const featureKey = (value as { featureKey?: unknown }).featureKey;
    return typeof featureKey === 'string' && featureKey.length > 0;
}

function isConstantBinding(value: unknown): value is { type: 'constant'; value?: unknown } {
    return Boolean(isObject(value) && (value as { type?: unknown }).type === 'constant');
}

function hasChannelField(descriptor: MaybeRecord): boolean {
    return (
        Object.prototype.hasOwnProperty.call(descriptor, 'channel') ||
        Object.prototype.hasOwnProperty.call(descriptor, 'channelAlias') ||
        Object.prototype.hasOwnProperty.call(descriptor, 'channelIndex')
    );
}

function tryNormalizeSelectorCandidate(candidate: unknown): ChannelSelectorValue | null {
    if (candidate == null) return null;
    if (typeof candidate === 'object') {
        const alias = tryNormalizeSelectorCandidate((candidate as { alias?: unknown }).alias);
        if (alias != null) return alias;
        return tryNormalizeSelectorCandidate((candidate as { index?: unknown }).index);
    }
    const normalized = normalizeChannelSelectorInput(candidate);
    return normalized != null ? normalized : null;
}

function extractChannelSelector(descriptor: MaybeRecord): ChannelSelectorValue | null {
    const direct = tryNormalizeSelectorCandidate((descriptor as { channel?: unknown }).channel);
    if (direct != null) return direct;
    const alias = tryNormalizeSelectorCandidate((descriptor as { channelAlias?: unknown }).channelAlias);
    if (alias != null) return alias;
    return tryNormalizeSelectorCandidate((descriptor as { channelIndex?: unknown }).channelIndex);
}

function sanitizeDescriptor(
    descriptor: MaybeRecord,
): { descriptor: MaybeRecord; selector: ChannelSelectorValue | null; mutated: boolean } {
    if (!isDescriptorLike(descriptor)) {
        return { descriptor, selector: null, mutated: false };
    }
    const selector = extractChannelSelector(descriptor);
    const hadChannel = hasChannelField(descriptor);
    if (!hadChannel) {
        return { descriptor, selector, mutated: false };
    }
    const migrated = migrateDescriptorChannels(descriptor);
    if (migrated) {
        return { descriptor: { ...migrated }, selector, mutated: true };
    }
    const next = { ...descriptor } as MaybeRecord;
    delete (next as { channel?: unknown }).channel;
    delete (next as { channelAlias?: unknown }).channelAlias;
    delete (next as { channelIndex?: unknown }).channelIndex;
    return { descriptor: next, selector, mutated: true };
}

function sanitizeDescriptorArray(
    value: unknown[],
    recordSelector: (selector: ChannelSelectorValue | null) => void,
): { value: unknown[]; mutated: boolean } {
    let mutated = false;
    const result = value.map((entry) => {
        if (Array.isArray(entry)) {
            const nested = sanitizeDescriptorArray(entry, recordSelector);
            if (nested.mutated) mutated = true;
            return nested.value;
        }
        if (isConstantBinding(entry)) {
            const sanitized = sanitizeBinding(entry, recordSelector);
            if (sanitized.mutated) mutated = true;
            return sanitized.value;
        }
        if (isDescriptorLike(entry)) {
            const sanitized = sanitizeDescriptor(entry as MaybeRecord);
            if (sanitized.selector != null) recordSelector(sanitized.selector);
            if (sanitized.mutated) mutated = true;
            return sanitized.descriptor;
        }
        return entry;
    });
    return mutated ? { value: result, mutated: true } : { value, mutated: false };
}

function sanitizeBinding(
    binding: { type: 'constant'; value?: unknown },
    recordSelector: (selector: ChannelSelectorValue | null) => void,
): { value: { type: 'constant'; value?: unknown }; mutated: boolean } {
    const { value } = binding;
    if (Array.isArray(value)) {
        const sanitized = sanitizeDescriptorArray(value, recordSelector);
        if (!sanitized.mutated) return { value: binding, mutated: false };
        return { value: { ...binding, value: sanitized.value }, mutated: true };
    }
    if (value && typeof value === 'object') {
        if (isDescriptorLike(value)) {
            const sanitized = sanitizeDescriptor(value as MaybeRecord);
            if (sanitized.selector != null) recordSelector(sanitized.selector);
            if (!sanitized.mutated) return { value: binding, mutated: false };
            return { value: { ...binding, value: sanitized.descriptor }, mutated: true };
        }
        if (isConstantBinding(value)) {
            const nested = sanitizeBinding(value as { type: 'constant'; value?: unknown }, recordSelector);
            if (!nested.mutated) return { value: binding, mutated: false };
            return { value: { ...binding, value: nested.value }, mutated: true };
        }
    }
    return { value: binding, mutated: false };
}

function sanitizeValue(
    value: unknown,
    recordSelector: (selector: ChannelSelectorValue | null) => void,
): { value: unknown; mutated: boolean } {
    if (Array.isArray(value)) {
        const sanitized = sanitizeDescriptorArray(value, recordSelector);
        return sanitized.mutated ? { value: sanitized.value, mutated: true } : { value, mutated: false };
    }
    if (isConstantBinding(value)) {
        const sanitized = sanitizeBinding(value, recordSelector);
        return sanitized.mutated ? { value: sanitized.value, mutated: true } : { value, mutated: false };
    }
    if (isDescriptorLike(value)) {
        const sanitized = sanitizeDescriptor(value as MaybeRecord);
        if (sanitized.selector != null) recordSelector(sanitized.selector);
        return sanitized.mutated ? { value: sanitized.descriptor, mutated: true } : { value, mutated: false };
    }
    return { value, mutated: false };
}

function hasChannelSelectorBinding(source: MaybeRecord): boolean {
    if (!Object.prototype.hasOwnProperty.call(source, 'channelSelector')) return false;
    const value = source.channelSelector as unknown;
    if (value == null) return false;
    if (isConstantBinding(value)) {
        return (value as { value?: unknown }).value != null;
    }
    return true;
}

function applyChannelSelector(
    target: MaybeRecord,
    selector: ChannelSelectorValue,
    mutateConfig = false,
): MaybeRecord {
    let mutated = false;
    const next: MaybeRecord = { ...target };
    if (!hasChannelSelectorBinding(next)) {
        next.channelSelector = { type: 'constant', value: selector };
        mutated = true;
    }
    if (mutateConfig && isObject(next.config)) {
        const config = next.config as MaybeRecord;
        if (config.channelSelector == null) {
            next.config = { ...config, channelSelector: selector };
            mutated = true;
        }
    }
    if (isObject(next.bindings)) {
        const bindings = next.bindings as MaybeRecord;
        if (!hasChannelSelectorBinding(bindings)) {
            next.bindings = { ...bindings, channelSelector: { type: 'constant', value: selector } };
            mutated = true;
        }
    }
    return mutated ? next : target;
}

function sanitizeRecord(
    source: MaybeRecord,
    recordSelector: (selector: ChannelSelectorValue | null) => void,
): { record: MaybeRecord; mutated: boolean } {
    let mutated = false;
    const next: MaybeRecord = { ...source };
    for (const [key, value] of Object.entries(source)) {
        if (key === 'children' || key === 'config' || key === 'bindings') continue;
        const sanitized = sanitizeValue(value, recordSelector);
        if (sanitized.mutated) {
            next[key] = sanitized.value;
            mutated = true;
        }
    }
    if (isObject(source.config)) {
        const sanitizedConfig = sanitizeRecord(source.config as MaybeRecord, recordSelector);
        if (sanitizedConfig.mutated) {
            next.config = sanitizedConfig.record;
            mutated = true;
        }
    }
    if (isObject(source.bindings)) {
        const sanitizedBindings = sanitizeRecord(source.bindings as MaybeRecord, recordSelector);
        if (sanitizedBindings.mutated) {
            next.bindings = sanitizedBindings.record;
            mutated = true;
        }
    }
    if (Array.isArray(source.children)) {
        let childrenMutated = false;
        const sanitizedChildren = (source.children as unknown[]).map((child) => {
            const sanitizedChild = sanitizeElementEntry(child);
            if (sanitizedChild !== child) childrenMutated = true;
            return sanitizedChild;
        });
        if (childrenMutated) {
            next.children = sanitizedChildren;
            mutated = true;
        }
    }
    return mutated ? { record: next, mutated: true } : { record: source, mutated: false };
}

function sanitizeElementEntry(entry: unknown): unknown {
    if (!isObject(entry)) return entry;
    const source = entry as MaybeRecord;
    const selectors: ChannelSelectorValue[] = [];
    const recordSelector = (selector: ChannelSelectorValue | null) => {
        if (selector == null) return;
        const normalized = normalizeChannelSelectorInput(selector);
        if (normalized == null) return;
        selectors.push(normalized);
    };
    const sanitized = sanitizeRecord(source, recordSelector);
    if (!sanitized.mutated && selectors.length === 0) {
        return entry;
    }
    const next = sanitized.mutated ? sanitized.record : { ...source };
    const selector = selectors.length > 0 ? selectors[0] : null;
    const elementType = typeof next.type === 'string' ? next.type : null;
    if (selector != null && elementType && CHANNEL_SELECTOR_ELEMENT_TYPES.has(elementType)) {
        return applyChannelSelector(next, selector, true);
    }
    return sanitized.mutated ? sanitized.record : entry;
}

function sanitizeElementsCollection(collection: unknown): unknown {
    if (!Array.isArray(collection)) return collection;
    let mutated = false;
    const result = collection.map((entry) => {
        const sanitized = sanitizeElementEntry(entry);
        if (sanitized !== entry) mutated = true;
        return sanitized;
    });
    return mutated ? result : collection;
}

function sanitizeElementsMap(mapLike: unknown): unknown {
    if (!isObject(mapLike) || Array.isArray(mapLike)) return mapLike;
    let mutated = false;
    const next: MaybeRecord = { ...(mapLike as MaybeRecord) };
    for (const [key, value] of Object.entries(mapLike as MaybeRecord)) {
        const sanitized = sanitizeElementEntry(value);
        if (sanitized !== value) {
            next[key] = sanitized;
            mutated = true;
        }
    }
    return mutated ? next : mapLike;
}

function sanitizeBindingsByElement(mapLike: unknown): unknown {
    if (!isObject(mapLike) || Array.isArray(mapLike)) return mapLike;
    let mutated = false;
    const next: MaybeRecord = { ...(mapLike as MaybeRecord) };
    for (const [elementId, bindings] of Object.entries(mapLike as MaybeRecord)) {
        if (!isObject(bindings)) continue;
        const selectors: ChannelSelectorValue[] = [];
        const recordSelector = (selector: ChannelSelectorValue | null) => {
            if (selector == null) return;
            const normalized = normalizeChannelSelectorInput(selector);
            if (normalized == null) return;
            selectors.push(normalized);
        };
        const sanitized = sanitizeRecord(bindings as MaybeRecord, recordSelector);
        let entry = sanitized.mutated ? sanitized.record : (bindings as MaybeRecord);
        if (selectors.length > 0) {
            entry = applyChannelSelector(entry, selectors[0]);
        }
        if (entry !== bindings) {
            next[elementId] = entry;
            mutated = true;
        }
    }
    return mutated ? next : mapLike;
}

export function migrateSceneAudioSystemV5<T extends SceneLike>(sceneState: T): T {
    if (!sceneState || typeof sceneState !== 'object') {
        return sceneState;
    }
    const migrated = migrateSceneAudioSystemV4(sceneState);
    const draft: MaybeRecord = { ...(migrated as unknown as MaybeRecord) };
    let mutated = false;

    if (Array.isArray(draft.elements)) {
        const sanitized = sanitizeElementsCollection(draft.elements);
        if (sanitized !== draft.elements) {
            draft.elements = sanitized;
            mutated = true;
        }
    } else if (draft.elements && typeof draft.elements === 'object') {
        const sanitized = sanitizeElementsMap(draft.elements);
        if (sanitized !== draft.elements) {
            draft.elements = sanitized;
            mutated = true;
        }
    }

    if (draft.scene && typeof draft.scene === 'object') {
        const sceneSnapshot = draft.scene as MaybeRecord;
        let sceneMutated = false;
        const nextScene: MaybeRecord = { ...sceneSnapshot };
        if (Array.isArray(sceneSnapshot.elements)) {
            const sanitized = sanitizeElementsCollection(sceneSnapshot.elements);
            if (sanitized !== sceneSnapshot.elements) {
                nextScene.elements = sanitized;
                sceneMutated = true;
            }
        } else if (sceneSnapshot.elements && typeof sceneSnapshot.elements === 'object') {
            const sanitized = sanitizeElementsMap(sceneSnapshot.elements);
            if (sanitized !== sceneSnapshot.elements) {
                nextScene.elements = sanitized;
                sceneMutated = true;
            }
        }
        if (sceneMutated) {
            draft.scene = nextScene;
            mutated = true;
        }
    }

    if (draft.bindings && typeof draft.bindings === 'object') {
        const bindingsSnapshot = draft.bindings as MaybeRecord;
        const byElement = bindingsSnapshot.byElement;
        if (byElement && typeof byElement === 'object') {
            const sanitized = sanitizeBindingsByElement(byElement);
            if (sanitized !== byElement) {
                draft.bindings = { ...bindingsSnapshot, byElement: sanitized };
                mutated = true;
            }
        }
    }

    if (draft.runtimeMeta && typeof draft.runtimeMeta === 'object') {
        const runtimeMeta = draft.runtimeMeta as MaybeRecord;
        if (runtimeMeta.schemaVersion !== 5) {
            draft.runtimeMeta = { ...runtimeMeta, schemaVersion: 5 };
            mutated = true;
        }
    }

    return mutated ? (draft as T) : migrated;
}

function gatherDescriptorsFromValue(value: unknown): MaybeRecord[] {
    if (isConstantBinding(value)) {
        return gatherDescriptorsFromValue((value as { value?: unknown }).value);
    }
    if (Array.isArray(value)) {
        const descriptors: MaybeRecord[] = [];
        for (const entry of value) {
            descriptors.push(...gatherDescriptorsFromValue(entry));
        }
        return descriptors;
    }
    if (isDescriptorLike(value)) {
        return [value as MaybeRecord];
    }
    return [];
}

function gatherDescriptorsFromRecord(record: MaybeRecord): MaybeRecord[] {
    const descriptors: MaybeRecord[] = [];
    for (const [key, value] of Object.entries(record)) {
        if (key === 'config' || key === 'bindings' || key === 'children') continue;
        descriptors.push(...gatherDescriptorsFromValue(value));
    }
    if (isObject(record.config)) {
        descriptors.push(...gatherDescriptorsFromRecord(record.config as MaybeRecord));
    }
    if (isObject(record.bindings)) {
        descriptors.push(...gatherDescriptorsFromRecord(record.bindings as MaybeRecord));
    }
    if (Array.isArray(record.children)) {
        for (const child of record.children as unknown[]) {
            if (isObject(child)) {
                descriptors.push(...gatherDescriptorsFromRecord(child as MaybeRecord));
            }
        }
    }
    return descriptors;
}

function collectElementSnapshots(state: unknown): ElementSnapshot[] {
    if (!state || typeof state !== 'object') return [];
    const snapshots: ElementSnapshot[] = [];
    const visit = (entry: unknown) => {
        if (!isObject(entry)) return;
        const source = entry as MaybeRecord;
        const id = typeof source.id === 'string' ? source.id : null;
        const type = typeof source.type === 'string' ? source.type : null;
        if (id || type) {
            snapshots.push({ id, type, source });
        }
        if (Array.isArray(source.children)) {
            for (const child of source.children as unknown[]) visit(child);
        }
    };
    const root = state as SceneLike;
    if (Array.isArray((root as any).elements)) {
        for (const entry of (root as any).elements as unknown[]) visit(entry);
    }
    if (root.scene && Array.isArray(root.scene.elements)) {
        for (const entry of root.scene.elements as unknown[]) visit(entry);
    }
    if (root.elements && typeof root.elements === 'object' && !Array.isArray(root.elements)) {
        for (const entry of Object.values(root.elements as Record<string, unknown>)) visit(entry);
    }
    return snapshots;
}

function collectBindingsSnapshots(state: unknown): Record<string, MaybeRecord> {
    if (!state || typeof state !== 'object') return {};
    const bindings = (state as SceneLike).bindings;
    if (!bindings || typeof bindings !== 'object') return {};
    const byElement = (bindings as { byElement?: Record<string, unknown> }).byElement;
    if (!byElement || typeof byElement !== 'object') return {};
    const snapshots: Record<string, MaybeRecord> = {};
    for (const [elementId, entry] of Object.entries(byElement)) {
        if (isObject(entry)) snapshots[elementId] = entry as MaybeRecord;
    }
    return snapshots;
}

function descriptorContainsChannel(descriptor: MaybeRecord): boolean {
    return hasChannelField(descriptor);
}

function elementHasChannelSelector(state: unknown, elementId: string): boolean {
    const elements = collectElementSnapshots(state);
    for (const snapshot of elements) {
        if (snapshot.id !== elementId) continue;
        const source = snapshot.source;
        if (hasChannelSelectorBinding(source)) return true;
        if (isObject(source.config) && (source.config as MaybeRecord).channelSelector != null) return true;
        if (isObject(source.bindings) && hasChannelSelectorBinding(source.bindings as MaybeRecord)) return true;
    }
    const bindings = collectBindingsSnapshots(state);
    const bindingEntry = bindings[elementId];
    if (bindingEntry && hasChannelSelectorBinding(bindingEntry)) return true;
    return false;
}

function stateHasChannelDescriptors(state: unknown): boolean {
    const elements = collectElementSnapshots(state);
    for (const snapshot of elements) {
        const descriptors = gatherDescriptorsFromRecord(snapshot.source);
        if (descriptors.some(descriptorContainsChannel)) return true;
    }
    const bindings = collectBindingsSnapshots(state);
    for (const entry of Object.values(bindings)) {
        const descriptors = gatherDescriptorsFromRecord(entry);
        if (descriptors.some(descriptorContainsChannel)) return true;
    }
    return false;
}

function collectElementsWithChannelSelectors(state: unknown): Set<string> {
    const result = new Set<string>();
    const elements = collectElementSnapshots(state);
    for (const snapshot of elements) {
        if (!snapshot.id) continue;
        const descriptors = gatherDescriptorsFromRecord(snapshot.source);
        if (descriptors.some(descriptorContainsChannel)) {
            result.add(snapshot.id);
        }
    }
    const bindings = collectBindingsSnapshots(state);
    for (const [elementId, entry] of Object.entries(bindings)) {
        const descriptors = gatherDescriptorsFromRecord(entry);
        if (descriptors.some(descriptorContainsChannel)) {
            result.add(elementId);
        }
    }
    return result;
}

export function verifySceneAudioSystemV5(before: unknown, after: unknown): boolean {
    if (stateHasChannelDescriptors(after)) {
        return false;
    }
    const beforeElements = collectElementsWithChannelSelectors(before);
    for (const elementId of beforeElements) {
        if (!elementHasChannelSelector(after, elementId)) {
            return false;
        }
    }
    return true;
}
