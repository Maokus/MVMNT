import { describe, it, expect } from 'vitest';
import {
    withRenderSafety,
    limitRenderObjects,
    checkCapability,
    hasCapability,
    DEFAULT_SAFETY_CONFIG,
    PluginSafetyError,
    getSafetyErrorMessage,
} from '../plugin-safety';

describe('Plugin Safety Controls', () => {
    const mockContext = {
        pluginId: 'test-plugin',
        elementType: 'test-element',
    };

    describe('withRenderSafety', () => {
        it('should execute function successfully and return result', () => {
            const result = withRenderSafety(
                () => [1, 2, 3],
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toEqual([1, 2, 3]);
        });

        it('should return null on error', () => {
            const result = withRenderSafety(
                () => {
                    throw new Error('Test error');
                },
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toBeNull();
        });

        it('should handle fast execution', () => {
            const result = withRenderSafety(
                () => {
                    let sum = 0;
                    for (let i = 0; i < 100; i++) {
                        sum += i;
                    }
                    return sum;
                },
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toBe(4950);
        });

        it('should not timeout for quick operations', () => {
            const result = withRenderSafety(
                () => 'quick',
                { ...DEFAULT_SAFETY_CONFIG, maxRenderTimeMs: 10 },
                mockContext
            );
            expect(result).toBe('quick');
        });
    });

    describe('limitRenderObjects', () => {
        it('should return objects unchanged when under limit', () => {
            const objects = [1, 2, 3, 4, 5];
            const result = limitRenderObjects(
                objects,
                { ...DEFAULT_SAFETY_CONFIG, maxRenderObjectsPerElement: 10 },
                mockContext
            );
            expect(result).toEqual(objects);
            expect(result.length).toBe(5);
        });

        it('should truncate objects when over limit', () => {
            const objects = Array.from({ length: 100 }, (_, i) => i);
            const result = limitRenderObjects(
                objects,
                { ...DEFAULT_SAFETY_CONFIG, maxRenderObjectsPerElement: 50 },
                mockContext
            );
            expect(result.length).toBe(50);
            expect(result[0]).toBe(0);
            expect(result[49]).toBe(49);
        });

        it('should handle empty arrays', () => {
            const result = limitRenderObjects(
                [],
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toEqual([]);
        });

        it('should use default config maxRenderObjectsPerElement', () => {
            const objects = Array.from({ length: DEFAULT_SAFETY_CONFIG.maxRenderObjectsPerElement + 100 }, (_, i) => i);
            const result = limitRenderObjects(
                objects,
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result.length).toBe(DEFAULT_SAFETY_CONFIG.maxRenderObjectsPerElement);
        });
    });

    describe('hasCapability', () => {
        it('should return true for existing capability', () => {
            const capabilities = ['audio-analysis', 'midi-events'];
            expect(hasCapability(capabilities, 'audio-analysis')).toBe(true);
            expect(hasCapability(capabilities, 'midi-events')).toBe(true);
        });

        it('should return false for missing capability', () => {
            const capabilities = ['audio-analysis'];
            expect(hasCapability(capabilities, 'network')).toBe(false);
        });

        it('should return false for undefined capabilities', () => {
            expect(hasCapability(undefined, 'audio-analysis')).toBe(false);
        });

        it('should return false for empty capabilities array', () => {
            expect(hasCapability([], 'audio-analysis')).toBe(false);
        });
    });

    describe('checkCapability', () => {
        it('should return true when capability exists', () => {
            const capabilities = ['audio-analysis', 'midi-events'];
            const result = checkCapability(
                capabilities,
                'audio-analysis',
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toBe(true);
        });

        it('should return false when capability missing', () => {
            const capabilities = ['audio-analysis'];
            const result = checkCapability(
                capabilities,
                'network',
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toBe(false);
        });

        it('should return true when enforcement is disabled', () => {
            const capabilities = ['audio-analysis'];
            const result = checkCapability(
                capabilities,
                'network',
                { ...DEFAULT_SAFETY_CONFIG, enforceCapabilities: false },
                mockContext
            );
            expect(result).toBe(true);
        });

        it('should return false for undefined capabilities', () => {
            const result = checkCapability(
                undefined,
                'audio-analysis',
                DEFAULT_SAFETY_CONFIG,
                mockContext
            );
            expect(result).toBe(false);
        });
    });

    describe('getSafetyErrorMessage', () => {
        it('should return correct message for TIMEOUT', () => {
            const message = getSafetyErrorMessage(PluginSafetyError.TIMEOUT);
            expect(message).toBe('Plugin element render timed out');
        });

        it('should return correct message for RENDER_OBJECT_LIMIT', () => {
            const message = getSafetyErrorMessage(PluginSafetyError.RENDER_OBJECT_LIMIT);
            expect(message).toBe('Plugin element exceeded render object limit');
        });

        it('should return correct message for CAPABILITY_VIOLATION', () => {
            const message = getSafetyErrorMessage(PluginSafetyError.CAPABILITY_VIOLATION);
            expect(message).toBe('Plugin element attempted unauthorized operation');
        });

        it('should return correct message for UNKNOWN', () => {
            const message = getSafetyErrorMessage(PluginSafetyError.UNKNOWN);
            expect(message).toBe('Plugin element encountered an error');
        });
    });

    describe('DEFAULT_SAFETY_CONFIG', () => {
        it('should have reasonable default values', () => {
            expect(DEFAULT_SAFETY_CONFIG.maxRenderObjectsPerElement).toBeGreaterThan(0);
            expect(DEFAULT_SAFETY_CONFIG.maxRenderTimeMs).toBeGreaterThan(0);
            expect(DEFAULT_SAFETY_CONFIG.enforceCapabilities).toBe(true);
        });

        it('should have maxRenderObjectsPerElement of 10000', () => {
            expect(DEFAULT_SAFETY_CONFIG.maxRenderObjectsPerElement).toBe(10000);
        });

        it('should have maxRenderTimeMs of 100', () => {
            expect(DEFAULT_SAFETY_CONFIG.maxRenderTimeMs).toBe(100);
        });
    });
});
