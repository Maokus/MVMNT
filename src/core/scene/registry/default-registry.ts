import { builtInCatalog } from '@core/scene/built-ins/catalog';
import { createBuiltInRegistration } from '@core/scene/built-ins/define-built-in';
import { setSceneElementPluginIdResolver } from './plugin-id-resolver';
import { SceneElementRegistry } from './scene-element-registry';

const seenTypes = new Set<string>();
const registrations = builtInCatalog.map(({ type, definition }) => {
    if (type !== definition.type) {
        throw new Error(`Built-in catalog type '${type}' does not match definition type '${definition.type}'`);
    }
    if (seenTypes.has(type)) throw new Error(`Duplicate built-in catalog type '${type}'`);
    seenTypes.add(type);
    return createBuiltInRegistration(definition);
});

export const sceneElementRegistry = new SceneElementRegistry(registrations);
setSceneElementPluginIdResolver((type) => sceneElementRegistry.getPluginId(type));
