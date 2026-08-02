import { sceneElementRegistry, type SceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { SceneElement } from '@core/scene/elements';
import { MissingPluginElement } from '@core/scene/elements/misc/missing-plugin';
import type { RenderObject } from '@core/render/modular-renderer';
import { serializeStable } from '@persistence/stable-stringify';
import { automationEvaluator } from '@automation/automation-evaluator';
import { getSharedTimingManager, useTimelineStore } from '@state/timelineStore';
// Side-effect import: registers the KeyframeBinding factory so
// PropertyBinding.fromSerialized can construct keyframe bindings.
import '@bindings/keyframe-binding';
import {
    useSceneStore,
    type BindingState,
    type ElementBindings,
    type SceneElementRecord,
    type SceneSettingsState,
    type SceneStoreState,
} from '@state/sceneStore';
import {
    buildSceneStructureIndex,
    resolveSceneFrame,
    type ResolvedSceneFrame,
    type SceneStructureIndex,
} from './resolvedScene';
import { deriveElementOrder } from '@state/scene-graph';

type SceneStoreBinding = typeof useSceneStore;

interface RuntimeElementEntry {
    element: SceneElement;
    signature: string;
    version: number;
}

export interface SceneRuntimeAdapterDiagnostics {
    version: number;
    settingsVersion: number;
    elementVersions: Record<string, number>;
}

export interface SceneRuntimeAdapterOptions {
    store?: SceneStoreBinding;
    registry?: SceneElementRegistry;
}

function isConstantBinding(binding: BindingState): binding is Extract<BindingState, { type: 'constant' }> {
    return binding.type === 'constant';
}

function buildConfigPayload(record: SceneElementRecord, bindings: ElementBindings, resetKeys: string[] = []) {
    const config: Record<string, unknown> = { id: record.id };
    for (const [property, binding] of Object.entries(bindings)) {
        if (binding.type === 'macro') {
            config[property] = { type: 'macro', macroId: binding.macroId };
        } else if (binding.type === 'keyframes') {
            config[property] = { type: 'keyframes', channelId: binding.channelId };
        } else if (isConstantBinding(binding)) {
            config[property] = { type: 'constant', value: binding.value };
        }
    }
    // Store updates remove optional bindings entirely. Explicitly reset those
    // keys on the long-lived runtime element so it falls back to its schema
    // default instead of retaining the previous value.
    for (const key of resetKeys) {
        config[key] = undefined;
    }
    return config;
}

function bindingsSignature(elementType: string, bindings: ElementBindings): string {
    const pairs = Object.entries(bindings).map(([property, binding]) => {
        if (binding.type === 'macro') {
            return `${property}=macro:${binding.macroId}`;
        }
        if (binding.type === 'keyframes') {
            return `${property}=keyframes:${binding.channelId}`;
        }
        try {
            return `${property}=const:${serializeStable(binding.value)}`;
        } catch {
            return `${property}=const:unserializable`;
        }
    });
    pairs.sort();
    return `${elementType}::${pairs.join('|')}`;
}

export class SceneRuntimeAdapter {
    private readonly store: SceneStoreBinding;
    private readonly registry: SceneElementRegistry;
    private readonly cache = new Map<string, RuntimeElementEntry>();
    private orderedIds: string[] = [];
    private settings: SceneSettingsState;
    private adapterVersion = 0;
    private settingsVersion = 0;
    private unsubscribe?: () => void;
    private disposed = false;
    private resolvedFrame: ResolvedSceneFrame | null = null;
    private structureIndex: SceneStructureIndex | null = null;
    private readonly handleFontLoaded: (event: Event) => void;
    private readonly handlePluginInstalled: (event: Event) => void;
    private readonly handlePluginAvailabilityChanged: (event: Event) => void;

    constructor(options?: SceneRuntimeAdapterOptions) {
        this.store = options?.store ?? useSceneStore;
        this.registry = options?.registry ?? sceneElementRegistry;
        this.handleFontLoaded = () => {
            for (const entry of this.cache.values()) {
                try {
                    entry.element.markBoundsDirty?.();
                } catch {}
            }
        };
        this.handlePluginInstalled = (event: Event) => {
            const detail = (event as CustomEvent)?.detail as { registeredTypes?: string[] } | undefined;
            const types = Array.isArray(detail?.registeredTypes) ? detail.registeredTypes : [];
            if (types.length) {
                this.refreshElementsForTypes(types);
            }
        };
        this.handlePluginAvailabilityChanged = (event: Event) => {
            const detail = (event as CustomEvent)?.detail as
                { registeredTypes?: string[]; unregisteredTypes?: string[] } | undefined;
            const types = new Set<string>();
            if (Array.isArray(detail?.registeredTypes)) {
                for (const type of detail.registeredTypes) {
                    if (type) types.add(type);
                }
            }
            if (Array.isArray(detail?.unregisteredTypes)) {
                for (const type of detail.unregisteredTypes) {
                    if (type) types.add(type);
                }
            }
            if (types.size > 0) {
                this.refreshElementsForTypes(Array.from(types));
            }
        };

        const initialState = this.store.getState();
        this.settings = { ...initialState.settings };
        this.orderedIds = deriveElementOrder(initialState.graph);
        this.bootstrap(initialState);
        this.unsubscribe = this.store.subscribe((next: SceneStoreState, prev: SceneStoreState) => {
            this.handleStateChange(next, prev);
        });
        if (typeof window !== 'undefined') {
            window.addEventListener('font-loaded', this.handleFontLoaded as EventListener);
            window.addEventListener('mvmnt-plugin-installed', this.handlePluginInstalled as EventListener);
            window.addEventListener(
                'mvmnt-plugin-availability-changed',
                this.handlePluginAvailabilityChanged as EventListener
            );
        }
    }

    dispose() {
        if (this.disposed) return;
        if (typeof window !== 'undefined') {
            window.removeEventListener('font-loaded', this.handleFontLoaded as EventListener);
            window.removeEventListener('mvmnt-plugin-installed', this.handlePluginInstalled as EventListener);
            window.removeEventListener(
                'mvmnt-plugin-availability-changed',
                this.handlePluginAvailabilityChanged as EventListener
            );
        }
        this.unsubscribe?.();
        this.cache.forEach((entry) => {
            try {
                entry.element.dispose?.();
            } catch {}
        });
        this.cache.clear();
        this.disposed = true;
    }

    getVersion() {
        return this.adapterVersion;
    }

    getSettingsVersion() {
        return this.settingsVersion;
    }

    getElementVersion(elementId: string) {
        return this.cache.get(elementId)?.version ?? 0;
    }

    getSceneSettings(): SceneSettingsState {
        return { ...this.settings };
    }

    getElements(): SceneElement[] {
        return this.orderedIds.map((id) => this.cache.get(id)?.element).filter((el): el is SceneElement => Boolean(el));
    }

    buildScene(config: any, targetTime: number): RenderObject[] {
        return this.resolveFrame(config, targetTime).renderObjects as RenderObject[];
    }

    resolveFrame(config: any, targetTime: number): ResolvedSceneFrame {
        const state = this.store.getState();
        if (
            this.resolvedFrame &&
            this.resolvedFrame.time === targetTime &&
            this.resolvedFrame.graphRevision === state.graph.revision &&
            this.resolvedFrame.runtimeVersion === this.adapterVersion
        ) {
            return this.resolvedFrame;
        }
        if (!this.structureIndex || this.structureIndex.graphRevision !== state.graph.revision) {
            this.structureIndex = buildSceneStructureIndex(state.graph);
        }
        this.resolvedFrame = resolveSceneFrame({
            graph: state.graph,
            time: targetTime,
            runtimeVersion: this.adapterVersion,
            config,
            getElement: (elementId) => this.cache.get(elementId)?.element,
            structure: this.structureIndex,
            evaluateNode: (node) => {
                const bindings = state.nodeBindings[node.id];
                if (!bindings) return node;
                const evaluated = {
                    ...node,
                    userNodeTransform: { ...node.userNodeTransform },
                } as typeof node;
                for (const [path, binding] of Object.entries(bindings)) {
                    let value: unknown;
                    if (binding.type === 'constant') value = binding.value;
                    else if (binding.type === 'macro') value = state.macros.byId[binding.macroId]?.value;
                    else {
                        value = state.propertyOverrides[binding.channelId];
                        if (value === undefined) {
                            const timing = getSharedTimingManager();
                            const tick = timing
                                ? timing.secondsToTicks(targetTime)
                                : useTimelineStore.getState().timeline.currentTick;
                            value = automationEvaluator.evaluate(binding.channelId, tick);
                        }
                    }
                    if (value === undefined) continue;
                    if (path === 'localVisible') evaluated.localVisible = Boolean(value);
                    else if (path === 'localLocked') evaluated.localLocked = Boolean(value);
                    else if (
                        path in evaluated.userNodeTransform &&
                        typeof value === 'number' &&
                        Number.isFinite(value)
                    ) {
                        evaluated.userNodeTransform[path as keyof typeof evaluated.userNodeTransform] = value;
                    }
                }
                return evaluated;
            },
        });
        return this.resolvedFrame;
    }

    collectDiagnostics(): SceneRuntimeAdapterDiagnostics {
        const elementVersions: Record<string, number> = {};
        for (const [id, entry] of this.cache.entries()) {
            elementVersions[id] = entry.version;
        }
        return {
            version: this.adapterVersion,
            settingsVersion: this.settingsVersion,
            elementVersions,
        };
    }

    private bootstrap(state: SceneStoreState) {
        for (const id of deriveElementOrder(state.graph)) {
            const record = state.elements[id];
            if (!record) continue;
            const bindings = state.bindings.byElement[id] ?? {};
            const entry = this.instantiateElement(record, bindings);
            if (entry) {
                this.cache.set(id, entry);
            }
        }
        this.adapterVersion += 1;
    }

    private instantiateElement(record: SceneElementRecord, bindings: ElementBindings): RuntimeElementEntry | null {
        try {
            const config = buildConfigPayload(record, bindings);
            const element = this.registry.createElement(record.type, config) as SceneElement | null;
            if (!element) {
                const placeholder = new MissingPluginElement(record.id, {
                    ...config,
                    missingType: record.type,
                });
                return {
                    element: placeholder,
                    signature: bindingsSignature(record.type, bindings),
                    version: 1,
                };
            }
            return {
                element,
                signature: bindingsSignature(record.type, bindings),
                version: 1,
            };
        } catch (error) {
            console.error('[SceneRuntimeAdapter] element instantiation failed', { record }, error);
            return null;
        }
    }

    private refreshElementsForTypes(types: string[]) {
        if (this.disposed) return;
        const typeSet = new Set(types);
        const state = this.store.getState();
        let mutated = false;
        for (const id of deriveElementOrder(state.graph)) {
            const record = state.elements[id];
            if (!record || !typeSet.has(record.type)) continue;
            const bindings = state.bindings.byElement[id] ?? {};
            const entry = this.cache.get(id);
            if (entry) {
                try {
                    entry.element.dispose?.();
                } catch {}
            }
            const created = this.instantiateElement(record, bindings);
            if (created) {
                this.cache.set(id, created);
                mutated = true;
            }
        }
        if (mutated) {
            this.adapterVersion += 1;
            try {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('mvmnt-scene-runtime-updated'));
                }
            } catch {}
        }
    }

    private handleStateChange(next: SceneStoreState, prev: SceneStoreState) {
        if (this.disposed) return;

        let mutated = false;

        // Detect automation channel changes and invalidate evaluator cache
        if (next.automation !== prev.automation) {
            const nextChannels = next.automation.channels;
            const prevChannels = prev.automation.channels;
            for (const channelId of Object.keys(prevChannels)) {
                if (nextChannels[channelId] !== prevChannels[channelId]) {
                    automationEvaluator.invalidateChannel(channelId);
                }
            }
            for (const channelId of Object.keys(nextChannels)) {
                if (!(channelId in prevChannels)) {
                    automationEvaluator.invalidateChannel(channelId);
                }
            }
            // Bump version so render loop picks up the change
            mutated = true;
        }

        if (next.settings !== prev.settings) {
            this.settings = { ...next.settings };
            this.settingsVersion += 1;
            mutated = true;
        }

        if (next.graph !== prev.graph) {
            this.orderedIds = deriveElementOrder(next.graph);
            mutated = true;
        }
        if (
            next.graph !== prev.graph ||
            next.nodeBindings !== prev.nodeBindings ||
            next.macros !== prev.macros ||
            next.propertyOverrides !== prev.propertyOverrides
        )
            mutated = true;

        const nextOrder = deriveElementOrder(next.graph);
        const prevOrder = deriveElementOrder(prev.graph);
        const nextIds = new Set(nextOrder);
        for (const id of prevOrder) {
            if (!nextIds.has(id)) {
                const entry = this.cache.get(id);
                if (entry) {
                    try {
                        entry.element.dispose?.();
                    } catch {}
                    this.cache.delete(id);
                    mutated = true;
                }
            }
        }

        for (const id of nextOrder) {
            const record = next.elements[id];
            if (!record) continue;
            const bindings = next.bindings.byElement[id] ?? {};
            const entry = this.cache.get(id);

            const typeChanged = record.type !== prev.elements[id]?.type;
            const bindingsChanged = next.bindings.byElement[id] !== prev.bindings.byElement[id];

            if (!entry || typeChanged) {
                if (entry) {
                    try {
                        entry.element.dispose?.();
                    } catch {}
                }
                const created = this.instantiateElement(record, bindings);
                if (created) {
                    this.cache.set(id, created);
                    mutated = true;
                }
                continue;
            }

            if (bindingsChanged) {
                const nextSignature = bindingsSignature(record.type, bindings);
                if (nextSignature !== entry.signature) {
                    try {
                        const previousBindings = prev.bindings.byElement[id] ?? {};
                        const removedKeys = Object.keys(previousBindings).filter((key) => !(key in bindings));
                        entry.element.updateConfig(buildConfigPayload(record, bindings, removedKeys));
                    } catch (error) {
                        console.error('[SceneRuntimeAdapter] element update failed', { id, error });
                        const recreated = this.instantiateElement(record, bindings);
                        if (recreated) {
                            this.cache.set(id, recreated);
                            mutated = true;
                        }
                        continue;
                    }
                    entry.signature = nextSignature;
                    entry.version += 1;
                    mutated = true;
                }
            }
        }

        if (mutated) {
            this.adapterVersion += 1;
            this.resolvedFrame = null;
            if (next.graph !== prev.graph) this.structureIndex = null;
        }
    }
}
