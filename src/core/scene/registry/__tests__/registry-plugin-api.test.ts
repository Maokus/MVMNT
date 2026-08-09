import { describe, expect, it } from 'vitest';
import { builtInCatalog } from '@core/scene/built-ins/catalog';
import { sceneElementRegistry, SceneElementRegistry, type SceneElementRegistration } from '@core/scene/registry';
import { BoundSceneElement } from '@core/scene/runtime/bound-scene-element';

class TestElement extends BoundSceneElement {
    static override getConfigSchema() {
        return {
            ...super.getConfigSchema(),
            name: 'Test Element',
            description: 'Registry test element',
            category: 'Tests',
        };
    }

    override _buildRenderObjects() {
        return [];
    }
}

function registration(
    type: string,
    origin: SceneElementRegistration['origin'] = { kind: 'plugin', pluginId: 'test.plugin' }
): SceneElementRegistration {
    return {
        type,
        origin,
        schema: TestElement.getConfigSchema(),
        create(config = {}) {
            return new TestElement(type, String(config.id ?? type), config);
        },
    };
}

describe('SceneElementRegistry', () => {
    it('registers a normalized, qualified plugin entry', () => {
        const registry = new SceneElementRegistry();
        const type = registry.register(registration('test.plugin:pulse'));

        expect(type).toBe('test.plugin:pulse');
        expect(registry.getPluginId(type)).toBe('test.plugin');
        expect(registry.getSchema(type)?.category).toBe('Tests');
        expect(registry.createElement(type, { id: 'pulse-1' })).toMatchObject({
            id: 'pulse-1',
            type: 'test.plugin:pulse',
        });
    });

    it('rejects invalid, unqualified, and duplicate registrations', () => {
        const registry = new SceneElementRegistry();
        expect(() => registry.register(registration(''))).toThrow('Invalid element type');
        expect(() => registry.register(registration('pulse'))).toThrow('must be qualified');

        registry.register(registration('test.plugin:pulse'));
        expect(() => registry.register(registration('test.plugin:pulse'))).toThrow('already registered');
    });

    it('protects built-ins and removes all entries owned by one plugin', () => {
        const registry = new SceneElementRegistry([
            registration('background', { kind: 'built-in' }),
            registration('test.plugin:first'),
            registration('test.plugin:second'),
        ]);

        expect(() => registry.unregisterElement('background')).toThrow('Cannot unregister built-in');
        expect(registry.unregisterPlugin('test.plugin')).toEqual(['test.plugin:first', 'test.plugin:second']);
        expect(registry.getAvailableTypes()).toEqual(['background']);
    });

    it('reports registration origin in element type information', () => {
        const registry = new SceneElementRegistry([
            registration('background', { kind: 'built-in' }),
            registration('test.plugin:pulse'),
        ]);

        expect(registry.getElementTypeInfo()).toEqual([
            expect.objectContaining({ type: 'background', pluginId: null }),
            expect.objectContaining({ type: 'test.plugin:pulse', pluginId: 'test.plugin' }),
        ]);
    });
});

describe('built-in catalog', () => {
    it('is the ordered registry inventory and has matching unique definition types', () => {
        const catalogTypes = builtInCatalog.map(({ type }) => type);
        expect(new Set(catalogTypes).size).toBe(catalogTypes.length);
        expect(builtInCatalog.every(({ type, definition }) => type === definition.type)).toBe(true);
        expect(sceneElementRegistry.getBuiltInTypes()).toEqual(catalogTypes);
    });

    it('exposes only serializable property schema data', () => {
        for (const type of sceneElementRegistry.getBuiltInTypes()) {
            const schema = sceneElementRegistry.getSchema(type);
            for (const tab of schema?.tabs ?? []) {
                for (const group of tab.groups) {
                    for (const property of group.properties) expect(property).not.toHaveProperty('runtime');
                }
            }
        }
    });
});
