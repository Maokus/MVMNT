import { sceneElementRegistry, type SceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { SceneElement } from '@core/scene/elements';
import type { RenderObject } from '@core/render/renderer-contract';
import { serializeStable } from '@persistence/stable-stringify';
import {
    useSceneStore,
    type BindingState,
    type ElementBindings,
    type SceneElementRecord,
    type SceneSettingsState,
    type SceneStoreState,
} from '@state/sceneStore';

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

function buildConfigPayload(record: SceneElementRecord, bindings: ElementBindings) {
    const config: Record<string, unknown> = { id: record.id };
    for (const [property, binding] of Object.entries(bindings)) {
        if (binding.type === 'macro') {
            config[property] = { type: 'macro', macroId: binding.macroId };
        } else if (isConstantBinding(binding)) {
            config[property] = { type: 'constant', value: binding.value };
        }
    }
    return config;
}

function bindingsSignature(elementType: string, bindings: ElementBindings): string {
    const pairs = Object.entries(bindings).map(([property, binding]) => {
        if (binding.type === 'macro') {
            return `${property}=macro:${binding.macroId}`;
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
    private readonly handleFontLoaded: (event: Event) => void;

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

        const initialState = this.store.getState();
        this.settings = { ...initialState.settings };
        this.orderedIds = [...initialState.order];
        this.bootstrap(initialState);
        this.unsubscribe = this.store.subscribe((next: SceneStoreState, prev: SceneStoreState) => {
            this.handleStateChange(next, prev);
        });
        if (typeof window !== 'undefined') {
            window.addEventListener('font-loaded', this.handleFontLoaded as EventListener);
        }
    }

    dispose() {
        if (this.disposed) return;
        if (typeof window !== 'undefined') {
            window.removeEventListener('font-loaded', this.handleFontLoaded as EventListener);
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
        const entries = this.orderedIds
            .map((id, index) => {
                const entry = this.cache.get(id);
                if (!entry) return null;
                return { id, element: entry.element, orderIndex: index };
            })
            .filter((item): item is { id: string; element: SceneElement; orderIndex: number } => item !== null);

        const visible = entries.filter((item) => {
            try {
                return item.element.visible;
            } catch {
                return false;
            }
        });

        visible.sort((a, b) => {
            const z = a.element.zIndex - b.element.zIndex;
            if (z !== 0) return z;
            return a.orderIndex - b.orderIndex;
        });

        const renderObjects: RenderObject[] = [];
        for (const { element } of visible) {
            try {
                const objects = element.buildRenderObjects(config, targetTime);
                if (Array.isArray(objects) && objects.length) {
                    renderObjects.push(...objects);
                }
            } catch (error) {
                console.warn('[SceneRuntimeAdapter] render object build failed', error);
            }
        }
        return renderObjects;
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
        for (const id of state.order) {
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
                console.warn(`[SceneRuntimeAdapter] failed to create element '${record.id}' of type '${record.type}'`);
                return null;
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

    private handleStateChange(next: SceneStoreState, prev: SceneStoreState) {
        if (this.disposed) return;

        let mutated = false;

        if (next.settings !== prev.settings) {
            this.settings = { ...next.settings };
            this.settingsVersion += 1;
            mutated = true;
        }

        if (next.order !== prev.order) {
            this.orderedIds = [...next.order];
            mutated = true;
        }

        const nextIds = new Set(next.order);
        for (const id of prev.order) {
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

        for (const id of next.order) {
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
                        entry.element.updateConfig(buildConfigPayload(record, bindings));
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
        }
    }
}
