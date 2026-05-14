import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { SceneElement } from '@core/scene/elements/base';

// Mock element class for testing
class TestCustomElement extends SceneElement {
    static override getConfigSchema() {
        return {
            ...super.getConfigSchema(),
            name: 'Test Custom Element',
            description: 'A test element for plugin registry',
            category: 'test',
        };
    }

    override _buildRenderObjects() {
        return [];
    }
}

describe('SceneElementRegistry - Plugin API', () => {
    const testType = 'test-custom-element';
    const testPluginId = 'test.plugin';

    afterEach(() => {
        // Clean up plugin-registered elements
        sceneElementRegistry.unregisterPlugin(testPluginId);
        // Clean up elements registered without a pluginId
        if (sceneElementRegistry.hasElement(testType)) {
            try {
                sceneElementRegistry.unregisterElement(testType);
            } catch {
                // ignore if it's a built-in
            }
        }
    });

    describe('registerCustomElement', () => {
        it('registers a custom element successfully', () => {
            expect(sceneElementRegistry.hasElement(testType)).toBe(false);

            const registryKey = sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
            });

            expect(sceneElementRegistry.hasElement(registryKey)).toBe(true);
            expect(sceneElementRegistry.getPluginId(registryKey)).toBe(testPluginId);
        });

        it('overrides category when specified', () => {
            const registryKey = sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
                overrideCategory: 'custom-category',
            });

            const schema = sceneElementRegistry.getSchema(registryKey);
            expect(schema?.category).toBe('custom-category');
        });

        it('throws error for invalid element type', () => {
            expect(() => {
                sceneElementRegistry.registerCustomElement('', TestCustomElement);
            }).toThrow('Invalid element type');
        });

        it('throws error when conflicting with built-in element', () => {
            expect(() => {
                sceneElementRegistry.registerCustomElement('background', TestCustomElement);
            }).toThrow('conflicts with built-in element');
        });

        it('throws error when element class lacks getConfigSchema', () => {
            // Create an element class without getConfigSchema method
            class InvalidElement {
                constructor(
                    public id: string,
                    public config: any
                ) {}
                _buildRenderObjects() {
                    return [];
                }
            }

            expect(() => {
                sceneElementRegistry.registerCustomElement(testType, InvalidElement as any);
            }).toThrow('must have static getConfigSchema()');
        });
    });

    describe('unregisterElement', () => {
        it('unregisters a custom element successfully', () => {
            const registryKey = sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
            });

            expect(sceneElementRegistry.hasElement(registryKey)).toBe(true);

            const result = sceneElementRegistry.unregisterElement(registryKey);

            expect(result).toBe(true);
            expect(sceneElementRegistry.hasElement(registryKey)).toBe(false);
        });

        it('returns false when element does not exist', () => {
            const result = sceneElementRegistry.unregisterElement('non-existent');
            expect(result).toBe(false);
        });

        it('throws error when attempting to unregister built-in element', () => {
            expect(() => {
                sceneElementRegistry.unregisterElement('background');
            }).toThrow('Cannot unregister built-in element');
        });
    });

    describe('unregisterPlugin', () => {
        it('unregisters all elements from a plugin', () => {
            const type1 = 'test-element-1';
            const type2 = 'test-element-2';

            const key1 = sceneElementRegistry.registerCustomElement(type1, TestCustomElement, {
                pluginId: testPluginId,
            });
            const key2 = sceneElementRegistry.registerCustomElement(type2, TestCustomElement, {
                pluginId: testPluginId,
            });

            expect(sceneElementRegistry.hasElement(key1)).toBe(true);
            expect(sceneElementRegistry.hasElement(key2)).toBe(true);

            const unregistered = sceneElementRegistry.unregisterPlugin(testPluginId);

            expect(unregistered).toEqual([key1, key2]);
            expect(sceneElementRegistry.hasElement(key1)).toBe(false);
            expect(sceneElementRegistry.hasElement(key2)).toBe(false);
        });

        it('returns empty array when plugin has no elements', () => {
            const unregistered = sceneElementRegistry.unregisterPlugin('non-existent-plugin');
            expect(unregistered).toEqual([]);
        });
    });

    describe('hasElement', () => {
        it('returns true for built-in elements', () => {
            expect(sceneElementRegistry.hasElement('background')).toBe(true);
            expect(sceneElementRegistry.hasElement('textOverlay')).toBe(true);
        });

        it('returns false for non-existent elements', () => {
            expect(sceneElementRegistry.hasElement('non-existent')).toBe(false);
        });

        it('returns true for registered custom elements', () => {
            sceneElementRegistry.registerCustomElement(testType, TestCustomElement);
            expect(sceneElementRegistry.hasElement(testType)).toBe(true);
        });
    });

    describe('isBuiltIn', () => {
        it('returns true for built-in elements', () => {
            expect(sceneElementRegistry.isBuiltIn('background')).toBe(true);
        });

        it('returns false for custom elements', () => {
            sceneElementRegistry.registerCustomElement(testType, TestCustomElement);
            expect(sceneElementRegistry.isBuiltIn(testType)).toBe(false);
        });

        it('returns false for non-existent elements', () => {
            expect(sceneElementRegistry.isBuiltIn('non-existent')).toBe(false);
        });
    });

    describe('getPluginId', () => {
        it('returns plugin ID for custom elements', () => {
            const registryKey = sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
            });
            expect(sceneElementRegistry.getPluginId(registryKey)).toBe(testPluginId);
        });

        it('returns undefined for built-in elements', () => {
            expect(sceneElementRegistry.getPluginId('background')).toBeUndefined();
        });

        it('returns undefined for non-existent elements', () => {
            expect(sceneElementRegistry.getPluginId('non-existent')).toBeUndefined();
        });
    });
});

describe('SceneElementRegistry - Built-in type drift detection', () => {
    it('registry built-in types match scripts/built-in-element-types.mjs', async () => {
        // Dynamically import the shared list used by the build script.
        // If this test fails, the build-script list and registry have drifted.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – no type declarations for the build-only .mjs module
        const mod = await import('../../../../../scripts/built-in-element-types.mjs');
        const BUILTIN_ELEMENT_TYPES = mod.BUILTIN_ELEMENT_TYPES as string[];

        const registryTypes = [...sceneElementRegistry.getBuiltInTypes()].sort();
        const scriptTypes = [...BUILTIN_ELEMENT_TYPES].sort();

        expect(registryTypes).toEqual(scriptTypes);
    });
});
