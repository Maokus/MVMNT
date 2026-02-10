import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { SceneElement } from '@core/scene/elements/base';

// Mock element class for testing
class TestCustomElement extends SceneElement {
    static override getConfigSchema() {
        return {
            name: 'Test Custom Element',
            description: 'A test element for plugin registry',
            category: 'test',
            groups: [],
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
        // Clean up any registered test elements
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

            sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
            });

            expect(sceneElementRegistry.hasElement(testType)).toBe(true);
            expect(sceneElementRegistry.getPluginId(testType)).toBe(testPluginId);
        });

        it('overrides category when specified', () => {
            sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
                overrideCategory: 'custom-category',
            });

            const schema = sceneElementRegistry.getSchema(testType);
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
                constructor(public id: string, public config: any) {}
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
            sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
            });

            expect(sceneElementRegistry.hasElement(testType)).toBe(true);

            const result = sceneElementRegistry.unregisterElement(testType);

            expect(result).toBe(true);
            expect(sceneElementRegistry.hasElement(testType)).toBe(false);
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

            sceneElementRegistry.registerCustomElement(type1, TestCustomElement, {
                pluginId: testPluginId,
            });
            sceneElementRegistry.registerCustomElement(type2, TestCustomElement, {
                pluginId: testPluginId,
            });

            expect(sceneElementRegistry.hasElement(type1)).toBe(true);
            expect(sceneElementRegistry.hasElement(type2)).toBe(true);

            const unregistered = sceneElementRegistry.unregisterPlugin(testPluginId);

            expect(unregistered).toEqual([type1, type2]);
            expect(sceneElementRegistry.hasElement(type1)).toBe(false);
            expect(sceneElementRegistry.hasElement(type2)).toBe(false);
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
            sceneElementRegistry.registerCustomElement(testType, TestCustomElement, {
                pluginId: testPluginId,
            });
            expect(sceneElementRegistry.getPluginId(testType)).toBe(testPluginId);
        });

        it('returns undefined for built-in elements', () => {
            expect(sceneElementRegistry.getPluginId('background')).toBeUndefined();
        });

        it('returns undefined for non-existent elements', () => {
            expect(sceneElementRegistry.getPluginId('non-existent')).toBeUndefined();
        });
    });
});
