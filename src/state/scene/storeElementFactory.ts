import { sceneElementRegistry, type SceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { SceneElement } from '@core/scene/elements';
import {
    deserializeElementBindings,
    type ElementBindings,
    type SceneElementInput,
    type SceneSerializedElement,
} from '@state/sceneStore';

export interface CreateSceneElementInputOptions {
    id: string;
    type: string;
    config?: Record<string, unknown>;
    index?: number;
    createdAt?: number;
    createdBy?: string;
    registry?: SceneElementRegistry;
}

/**
 * Instantiate a scene element via the registry to obtain a normalized binding payload
 * for the store. Disposes the temporary element to avoid leaking listeners.
 */
export function createSceneElementInputFromSchema(options: CreateSceneElementInputOptions): SceneElementInput {
    const registry = options.registry ?? sceneElementRegistry;
    const elementConfig = { ...(options.config ?? {}), id: options.id };
    const instance = registry.createElement(options.type, elementConfig) as SceneElement | null;
    if (!instance || typeof (instance as any).getSerializableConfig !== 'function') {
        throw new Error(
            `[sceneStore] Failed to instantiate element '${options.type}' via registry for store creation`
        );
    }

    try {
        const serialized = instance.getSerializableConfig() as SceneSerializedElement;
        const bindings: ElementBindings = deserializeElementBindings(serialized);
        return {
            id: options.id,
            type: options.type,
            index: options.index,
            createdAt: options.createdAt,
            createdBy: options.createdBy,
            bindings,
        };
    } finally {
        try {
            instance.dispose?.();
        } catch {
            /* non-fatal cleanup */
        }
    }
}
