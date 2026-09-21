import { sceneElementRegistry, type SceneElementRegistry } from '@core/scene/registry';
import type { SceneElementInstance } from '@core/scene/runtime/types';
import type { ElementPropertyDefinition } from '@mvmnt-app/plugin-sdk';
import {
    deserializeElementBindings,
    type ElementBindings,
    type SceneElementInput,
    type SceneSerializedElement,
} from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';

export interface CreateSceneElementInputOptions {
    id: string;
    type: string;
    config?: Record<string, unknown>;
    index?: number;
    createdAt?: number;
    createdBy?: string;
    registry?: SceneElementRegistry;
}

function withSingleTrackDefaults(
    config: Record<string, unknown>,
    type: string,
    registry: SceneElementRegistry
): Record<string, unknown> {
    const schema = registry.getSchema(type);
    if (!schema) return config;
    const timeline = useTimelineStore.getState();
    const next = { ...config };
    for (const property of schema.tabs.flatMap((tab) => tab.groups.flatMap((group) => group.properties))) {
        const trackProperty = property as ElementPropertyDefinition<'timelineTrackRef'>;
        if (trackProperty.type !== 'timelineTrackRef' || Object.prototype.hasOwnProperty.call(config, property.key)) {
            continue;
        }
        const allowedTypes = trackProperty.allowedTrackTypes?.length ? trackProperty.allowedTrackTypes : ['midi'];
        const compatibleTrackIds = timeline.tracksOrder.filter((trackId) => {
            const track = timeline.tracks[trackId];
            return track && allowedTypes.includes(track.type);
        });
        if (compatibleTrackIds.length === 1) {
            next[property.key] = trackProperty.allowMultiple ? compatibleTrackIds : compatibleTrackIds[0];
        }
    }
    return next;
}

/**
 * Instantiate a scene element via the registry to obtain a normalized binding payload
 * for the store. Disposes the temporary element to avoid leaking listeners.
 */
export function createSceneElementInputFromSchema(options: CreateSceneElementInputOptions): SceneElementInput {
    const registry = options.registry ?? sceneElementRegistry;
    const elementConfig = {
        ...withSingleTrackDefaults(options.config ?? {}, options.type, registry),
        id: options.id,
    };
    const instance = registry.createElement(options.type, elementConfig) as SceneElementInstance | null;
    if (!instance || typeof (instance as any).getSerializableConfig !== 'function') {
        throw new Error(`[sceneStore] Failed to instantiate element '${options.type}' via registry for store creation`);
    }

    try {
        const serialized = instance.getSerializableConfig() as unknown as SceneSerializedElement;
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
