import { sceneElementRegistry, type SceneElementRegistry } from '@core/scene/registry';
import type { SceneElementInstance } from '@core/scene/runtime/types';
import { MissingPluginElement } from '@core/scene/runtime/missing-plugin';
import type { RenderObject } from '@core/render/modular-renderer';
import { serializeStable } from '@persistence/stable-stringify';
import { automationEvaluator } from '@automation/automation-evaluator';
import { resolveBindingStateValue } from '@bindings/resolve-binding-state';
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
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { normalizeElementOutputBlendMode } from '@utils/blend-modes';
import {
    SimulationGeneration,
    simulationInputIdentity,
    simulationAuthoredIdentity,
    sameSimulationInputs,
} from '@core/scene/runtime/simulation-inputs';
import {
    SimulationPending,
    withSimulationPreviewBudget,
    type SimulationReadiness,
    type SimulationStatus,
} from '@core/scene/runtime/simulation-runner';

type SceneStoreBinding = typeof useSceneStore;

interface RuntimeElementEntry {
    element: SceneElementInstance;
    signature: string;
    version: number;
}

export interface SceneRuntimeAdapterDiagnostics {
    version: number;
    settingsVersion: number;
    elementVersions: Record<string, number>;
    simulations: readonly ElementSimulationReadiness[];
}

export interface ElementSimulationReadiness extends SimulationReadiness {
    readonly elementId: string;
    readonly elementType: string;
}

export interface SceneSimulationReadiness {
    readonly status: 'ready' | 'preparing' | 'pending' | 'error';
    readonly reason?: string;
    readonly affected: readonly ElementSimulationReadiness[];
}

const READY_SIMULATION_SNAPSHOT: SceneSimulationReadiness = Object.freeze({
    status: 'ready',
    affected: Object.freeze([]),
});

const simulationPriority: Record<SimulationStatus, number> = {
    error: 4,
    pending: 3,
    preparing: 2,
    idle: 1,
    ready: 0,
    disposed: 0,
};

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

function pluginIdFromQualifiedType(type: string): string | undefined {
    const separator = type.lastIndexOf(':');
    return separator > 0 ? type.slice(0, separator) : undefined;
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
    private unsubscribeEditor?: () => void;
    private unsubscribeTimeline?: () => void;
    private simulationGeneration?: SimulationGeneration;
    private simulationIdentity: unknown[] = [];
    private readonly simulationListeners = new Set<() => void>();
    private readonly simulationLifetime = new AbortController();
    private simulationReadiness: SceneSimulationReadiness = READY_SIMULATION_SNAPSHOT;
    private simulationNotificationQueued = false;
    private exportSimulation?: {
        session: object;
        generation?: SimulationGeneration;
        identity?: unknown[];
        authored: unknown[];
    };

    private collectSimulationReadiness(): SceneSimulationReadiness {
        const affected = this.getElements()
            .filter((element) => element.hasSimulation)
            .map((element): ElementSimulationReadiness | undefined => {
                const readiness = element.getSimulationReadiness?.();
                if (!readiness || readiness.status === 'ready' || readiness.status === 'disposed') return undefined;
                return Object.freeze({
                    ...readiness,
                    elementId: element.id ?? element.type,
                    elementType: element.type,
                });
            })
            .filter((value): value is ElementSimulationReadiness => value !== undefined)
            .sort((left, right) => simulationPriority[right.status] - simulationPriority[left.status]);
        if (!affected.length) return READY_SIMULATION_SNAPSHOT;
        const first = affected[0];
        const status: SceneSimulationReadiness['status'] =
            first.status === 'error' ? 'error' : first.status === 'pending' ? 'pending' : 'preparing';
        return Object.freeze({ status, reason: first.reason, affected: Object.freeze(affected) });
    }

    private updateSimulationReadiness(): boolean {
        const next = this.collectSimulationReadiness();
        if (serializeStable(next) === serializeStable(this.simulationReadiness)) return false;
        this.simulationReadiness = next;
        return true;
    }

    getSimulationReadiness = (): SceneSimulationReadiness => this.simulationReadiness;

    getSimulationStatus = (): 'ready' | 'preparing' | 'pending' | 'error' => this.simulationReadiness.status;

    subscribeSimulationStatus = (listener: () => void): (() => void) => {
        this.simulationListeners.add(listener);
        return () => {
            this.simulationListeners.delete(listener);
        };
    };

    private simulationChanged = () => {
        if (this.disposed) return;
        this.invalidateResolvedFrame();
        this.updateSimulationReadiness();
        if (this.simulationNotificationQueued) return;
        this.simulationNotificationQueued = true;
        queueMicrotask(() => {
            this.simulationNotificationQueued = false;
            if (this.disposed) return;
            for (const listener of [...this.simulationListeners]) listener();
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mvmnt-scene-runtime-updated'));
        });
    };

    private getSimulationGeneration(): SimulationGeneration {
        const scene = this.store.getState();
        const timeline = useTimelineStore.getState();
        const identity = simulationInputIdentity(scene, timeline);
        if (this.exportSimulation) {
            if (!sameSimulationInputs(this.exportSimulation.authored, simulationAuthoredIdentity(scene, timeline)))
                throw new Error('Simulation inputs were edited during export. Restart the export.');
            if (this.exportSimulation.generation) return this.exportSimulation.generation;
        }
        if (!this.simulationGeneration || !sameSimulationInputs(identity, this.simulationIdentity)) {
            this.simulationGeneration = new SimulationGeneration(scene, timeline, this.simulationGeneration);
            this.simulationIdentity = identity;
        }
        if (this.exportSimulation) {
            // Export owns a distinct input copy and runner session, never preview's mutable replay.
            this.exportSimulation.generation = new SimulationGeneration(scene, timeline);
            this.exportSimulation.identity = identity;
            return this.exportSimulation.generation;
        }
        return this.simulationGeneration;
    }

    requestSimulationFrame(seconds: number): void {
        const elements = this.getElements().filter((element) => element.hasSimulation);
        if (!elements.length) return;
        // Export frames are prepared explicitly before they are rendered. Ignore
        // incidental preview renders (for example, the one scheduled by the
        // export canvas resize) so they cannot retarget the export runners.
        if (this.exportSimulation) return;
        const generation = this.getSimulationGeneration();
        withSimulationPreviewBudget(() => {
            for (const element of elements)
                element.requestSimulationFrame?.(seconds, generation, this.simulationChanged);
        });
    }

    async prepareFrame(seconds: number, signal?: AbortSignal): Promise<void> {
        signal = AbortSignal.any([this.simulationLifetime.signal, ...(signal ? [signal] : [])]);
        for (;;) {
            const elements = this.getElements().filter((element) => element.hasSimulation);
            if (!elements.length) return;
            const controller = new AbortController();
            const abort = () => controller.abort();
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) controller.abort();
            let changed = false;
            let wake!: () => void;
            const updated = new Promise<void>((resolve) => {
                wake = resolve;
            });
            const unsubscribe = useTimelineStore.subscribe((next, prev) => {
                const scene = this.store.getState();
                if (!sameSimulationInputs(simulationInputIdentity(scene, next), simulationInputIdentity(scene, prev))) {
                    changed = true;
                    controller.abort();
                    wake();
                }
            });
            const abortWait = () => wake();
            const unsubscribeScene = this.store.subscribe((next, prev) => {
                const timeline = useTimelineStore.getState();
                if (
                    !sameSimulationInputs(
                        simulationInputIdentity(next, timeline),
                        simulationInputIdentity(prev, timeline)
                    )
                ) {
                    changed = true;
                    controller.abort();
                    wake();
                }
            });
            signal?.addEventListener('abort', abortWait, { once: true });
            try {
                const generation = this.getSimulationGeneration();
                await Promise.all(
                    elements.map((element) =>
                        element.prepareSimulationFrame?.(
                            seconds,
                            generation,
                            this.simulationChanged,
                            controller.signal,
                            this.exportSimulation?.session
                        )
                    )
                );
                return;
            } catch (error) {
                if (signal?.aborted) throw new DOMException('Simulation cancelled', 'AbortError');
                if (!changed && !(error instanceof SimulationPending)) throw error;
                if (!changed) await updated;
                if (signal?.aborted) throw new DOMException('Simulation cancelled', 'AbortError');
                if (this.exportSimulation?.generation)
                    this.exportSimulation.generation = this.exportSimulation.generation.withReadyInputs(
                        this.store.getState(),
                        useTimelineStore.getState()
                    );
            } finally {
                unsubscribe();
                unsubscribeScene();
                controller.abort();
                signal?.removeEventListener('abort', abort);
                signal?.removeEventListener('abort', abortWait);
            }
        }
    }

    beginSimulationExport(): () => void {
        if (this.exportSimulation) throw new Error('A simulation export session is already active');
        const session = {};
        this.exportSimulation = {
            session,
            authored: simulationAuthoredIdentity(this.store.getState(), useTimelineStore.getState()),
        };
        return () => {
            for (const element of this.getElements()) element.releaseSimulationSession?.(session);
            this.exportSimulation = undefined;
            this.simulationChanged();
        };
    }
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
            // Text geometry is part of the resolved frame. Marking element
            // bounds dirty alone leaves that frame cached until an unrelated
            // scene edit changes its version.
            this.resolvedFrame = null;
            this.adapterVersion += 1;
            try {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('mvmnt-scene-runtime-updated'));
                }
            } catch {}
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
        this.updateSimulationReadiness();
        this.unsubscribe = this.store.subscribe((next: SceneStoreState, prev: SceneStoreState) => {
            this.handleStateChange(next, prev);
        });
        this.unsubscribeTimeline = useTimelineStore.subscribe((next, prev) => {
            const scene = this.store.getState();
            if (!sameSimulationInputs(simulationInputIdentity(scene, next), simulationInputIdentity(scene, prev))) {
                this.simulationChanged();
            }
        });
        this.unsubscribeEditor = useSceneEditorStore.subscribe((next, prev) => {
            if (next.runtimeRevision === prev.runtimeRevision) return;
            this.resolvedFrame = null;
            this.adapterVersion += 1;
            // Transient inspector edits do not mutate the persisted scene store,
            // so explicitly wake the paused preview renderer as well.
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('mvmnt-scene-runtime-updated'));
            }
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
        this.simulationLifetime.abort();
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
        this.unsubscribeEditor?.();
        this.unsubscribeTimeline?.();
        this.cache.forEach((entry) => {
            try {
                entry.element.dispose?.();
            } catch {}
        });
        this.cache.clear();
        this.simulationGeneration = undefined;
        this.exportSimulation = undefined;
        this.simulationListeners.clear();
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

    getElements(): SceneElementInstance[] {
        return this.orderedIds
            .map((id) => this.cache.get(id)?.element)
            .filter((el): el is SceneElementInstance => Boolean(el));
    }

    buildScene(config: any, targetTime: number): RenderObject[] {
        return this.resolveFrame(config, targetTime).renderObjects as RenderObject[];
    }

    /**
     * Discard the resolved frame without changing the scene's persisted state.
     *
     * Visual resources decode asynchronously and mutate their resource status
     * outside the scene store.  Their completion therefore does not change the
     * graph revision or runtime version used by `resolveFrame`'s cache key.
     */
    invalidateResolvedFrame(): void {
        this.resolvedFrame = null;
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
                const transientTransform = useSceneEditorStore.getState().transientNodeTransforms[node.id];
                if (!bindings && !transientTransform) return node;
                const evaluated = {
                    ...node,
                    userNodeTransform: { ...node.userNodeTransform },
                } as typeof node;
                for (const [path, binding] of Object.entries(bindings ?? {})) {
                    const timing = getSharedTimingManager();
                    const tick = timing
                        ? timing.secondsToTicks(targetTime)
                        : useTimelineStore.getState().timeline.currentTick;
                    const value = resolveBindingStateValue(binding, {
                        tick,
                        macroValue: (macroId) => state.macros.byId[macroId]?.value,
                    });
                    if (value === undefined) continue;
                    if (path === 'localVisible') evaluated.localVisible = Boolean(value);
                    else if (path === 'localLocked') evaluated.localLocked = Boolean(value);
                    else if (path === 'localOpacity' && typeof value === 'number' && Number.isFinite(value)) {
                        evaluated.localOpacity = Math.max(0, Math.min(1, value));
                    } else if (path === 'outputBlendMode' && evaluated.kind === 'element') {
                        evaluated.outputBlendMode = normalizeElementOutputBlendMode(value);
                    } else if (
                        path in evaluated.userNodeTransform &&
                        typeof value === 'number' &&
                        Number.isFinite(value)
                    ) {
                        evaluated.userNodeTransform[path as keyof typeof evaluated.userNodeTransform] =
                            path === 'scaleX' || path === 'scaleY'
                                ? Math.abs(value) < 0.001
                                    ? value < 0
                                        ? -0.001
                                        : 0.001
                                    : value
                                : value;
                    }
                }
                if (transientTransform) {
                    Object.assign(evaluated.userNodeTransform, transientTransform);
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
            simulations: this.getElements()
                .filter((element) => element.hasSimulation)
                .map((element) => ({
                    ...(element.getSimulationReadiness?.() ?? {
                        status: 'idle' as const,
                        completedStep: -1,
                        targetStep: 0,
                        changedAt: 0,
                        lagSteps: 1,
                    }),
                    elementId: element.id ?? element.type,
                    elementType: element.type,
                })),
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
            const element = this.registry.createElement(record.type, config);
            if (!element) {
                const visible = config.visible;
                const placeholder = new MissingPluginElement(record.id, {
                    ...(visible === undefined ? {} : { visible }),
                    missingType: record.type,
                    missingPluginId: pluginIdFromQualifiedType(record.type),
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
                this.cache.delete(id);
                mutated = true;
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
        if (next.graph !== prev.graph || next.nodeBindings !== prev.nodeBindings || next.macros !== prev.macros)
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
            if (this.updateSimulationReadiness()) {
                for (const listener of [...this.simulationListeners]) listener();
            }
            try {
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('mvmnt-scene-runtime-updated'));
                }
            } catch {}
        }
    }
}
