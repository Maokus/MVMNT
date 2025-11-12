import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const macroTestHarness = vi.hoisted(() => {
    const listeners = new Set<(event: any) => void>();
    const macros = new Map<string, { id: string; type: string; value: any }>();
    return {
        addListener(listener: (event: any) => void) {
            listeners.add(listener);
        },
        removeListener(listener: (event: any) => void) {
            listeners.delete(listener);
        },
        emit(event: any) {
            listeners.forEach((listener) => {
                try {
                    listener(event);
                } catch (error) {
                    // surface errors in tests while keeping listener loop intact
                    throw error;
                }
            });
        },
        getMacro(id: string) {
            return macros.get(id);
        },
        setMacro(macro: { id: string; type: string; value: any }) {
            macros.set(macro.id, { ...macro });
        },
        clearMacros() {
            macros.clear();
        },
    };
});

vi.mock('@state/scene/macroSyncService', () => ({
    subscribeToMacroEvents: vi.fn((listener: (event: any) => void) => {
        macroTestHarness.addListener(listener);
        return () => {
            macroTestHarness.removeListener(listener);
        };
    }),
    getMacroById: (macroId: string) => macroTestHarness.getMacro(macroId),
    updateMacroValue: vi.fn((macroId: string, value: unknown) => {
        const existing = macroTestHarness.getMacro(macroId) ?? {
            id: macroId,
            type: 'timelineTrackRef',
            value: undefined,
        };
        const previousValue = existing.value;
        const next = { ...existing, value };
        macroTestHarness.setMacro(next);
        macroTestHarness.emit({ type: 'macroValueChanged', macroId, value, previousValue });
    }),
    __emitMacroEvent: (event: any) => macroTestHarness.emit(event),
    __setMacro: (macro: { id: string; type: string; value: any }) => macroTestHarness.setMacro(macro),
    __resetMacroTestHarness: () => macroTestHarness.clearMacros(),
}));

vi.mock('@audio/features/subscriptionSync', () => ({
    syncElementSubscriptions: vi.fn(),
    getElementSubscriptions: vi.fn(() => []),
    hasSubscription: vi.fn(() => false),
    isInRequirements: vi.fn(() => false),
    getElementSubscriptionDetails: vi.fn(() => []),
}));

import { SceneElement, asBoolean, asNumber, asTrimmedString } from '@core/scene/elements/base';
import * as sceneApi from '@audio/features/sceneApi';
import { registerFeatureRequirements, resetFeatureRequirementsForTests } from '@audio/audioElementMetadata';
import { syncElementSubscriptions } from '@audio/features/subscriptionSync';
import * as macroSyncService from '@state/scene/macroSyncService';

const mockedSync = vi.mocked(syncElementSubscriptions);

beforeEach(() => {
    resetFeatureRequirementsForTests();
    mockedSync.mockClear();
    (macroSyncService as any).__resetMacroTestHarness?.();
});

afterEach(() => {
    resetFeatureRequirementsForTests();
    mockedSync.mockClear();
});

describe('SceneElement lifecycle', () => {
    it('clears lazy audio feature intents during disposal', () => {
        const clearSpy = vi.spyOn(sceneApi, 'clearFeatureData');
        const unsubscribe = vi.fn();

        const element = Object.create(SceneElement.prototype) as SceneElement;
        Reflect.set(element, 'id', 'element-42');
        Reflect.set(element, 'type', 'testElement');
        Reflect.set(element, '_macroUnsubscribe', unsubscribe);

        SceneElement.prototype.dispose.call(element);

        expect(clearSpy).toHaveBeenCalledWith(element);
        expect(unsubscribe).toHaveBeenCalled();
    });
});

describe('SceneElement audio requirements integration', () => {
    it('subscribes to registered requirements when constructed', () => {
        registerFeatureRequirements('audioTest', [{ feature: 'spectrogram' }]);

        class AudioTestElement extends SceneElement {
            constructor(config: Record<string, unknown> = {}) {
                super('audioTest', 'el-1', config);
            }
        }

        const element = new AudioTestElement({ audioTrackId: 'track-1' });
        const calls = mockedSync.mock.calls.filter(([instance]) => instance === element);
        expect(calls.length).toBeGreaterThan(0);
        const lastCall = calls.at(-1);
        expect(lastCall?.[1]).toBe('track-1');
        expect(lastCall?.[2]).toEqual([{ feature: 'spectrogram' }]);
    });

    it('resubscribes when the track id changes', () => {
        registerFeatureRequirements('audioTest', [{ feature: 'rms' }]);

        class AudioTestElement extends SceneElement {
            constructor(config: Record<string, unknown> = {}) {
                super('audioTest', 'el-2', config);
            }
        }

        const element = new AudioTestElement({ audioTrackId: 'initial' });
        mockedSync.mockClear();

        element.updateConfig({ audioTrackId: 'next-track' });

        expect(mockedSync).toHaveBeenCalledTimes(1);
        const [instance, trackId, requirements] = mockedSync.mock.calls[0]!;
        expect(instance).toBe(element);
        expect(trackId).toBe('next-track');
        expect(requirements).toEqual([{ feature: 'rms' }]);
    });

    it('clears subscriptions when the track id is removed', () => {
        registerFeatureRequirements('audioTest', [{ feature: 'waveform' }]);

        class AudioTestElement extends SceneElement {
            constructor(config: Record<string, unknown> = {}) {
                super('audioTest', 'el-3', config);
            }
        }

        const element = new AudioTestElement({ audioTrackId: 'keep-me' });
        mockedSync.mockClear();

        element.updateConfig({ audioTrackId: null });

        expect(mockedSync).toHaveBeenCalledTimes(1);
        const [instance, trackId] = mockedSync.mock.calls[0]!;
        expect(instance).toBe(element);
        expect(trackId).toBeNull();
    });

    it('resubscribes when a macro-bound track value changes', () => {
        registerFeatureRequirements('audioMacroTest', [{ feature: 'waveform' }]);

        class AudioMacroElement extends SceneElement {
            constructor(config: Record<string, unknown> = {}) {
                super('audioMacroTest', 'macro-el', config);
            }
        }

        (macroSyncService as any).__setMacro?.({
            id: 'macro-track',
            type: 'timelineTrackRef',
            value: 'track-initial',
        });

        const element = new AudioMacroElement();
        element.bindToMacro('audioTrackId', 'macro-track');
        (element as any)._subscribeToRequiredFeatures();

        mockedSync.mockClear();

        (macroSyncService as any).__setMacro?.({
            id: 'macro-track',
            type: 'timelineTrackRef',
            value: 'track-next',
        });

        (macroSyncService as any).__emitMacroEvent?.({
            type: 'macroValueChanged',
            macroId: 'macro-track',
            value: 'track-next',
            previousValue: 'track-initial',
        });

        expect(mockedSync).toHaveBeenCalledTimes(1);
        const [instance, trackId, requirements] = mockedSync.mock.calls[0]!;
        expect(instance).toBe(element);
        expect(trackId).toBe('track-next');
        expect(requirements).toEqual([{ feature: 'waveform' }]);

        element.dispose();
    });
});

describe('SceneElement property snapshots', () => {
    class PropertyHarness extends SceneElement {
        constructor(config: Record<string, unknown> = {}) {
            super('propertyHarness', 'prop-1', config);
        }

        public snapshot<TDescriptors extends Record<string, any>>(descriptors: TDescriptors) {
            return this.getProps(descriptors);
        }
    }

    it('applies defaults when the property is missing', () => {
        const element = new PropertyHarness();

        const props = element.snapshot({
            missingWithDefault: { defaultValue: 42 },
            missingWithoutDefault: {},
        });

        expect(props.missingWithDefault).toBe(42);
        expect(props.missingWithoutDefault).toBeUndefined();
    });

    it('runs transforms and provides the element context', () => {
        const element = new PropertyHarness({
            numericLike: '5.5',
            truthyString: 'true',
            paddedLabel: '  hello  ',
        });

        const props = element.snapshot({
            numericLike: { transform: asNumber, defaultValue: 0 },
            truthyString: { transform: asBoolean, defaultValue: false },
            paddedLabel: { transform: asTrimmedString },
            seesElement: {
                transform: (_value: unknown, instance: PropertyHarness) => instance === element,
                defaultValue: false,
            },
        });

        expect(props.numericLike).toBe(5.5);
        expect(props.truthyString).toBe(true);
        expect(props.paddedLabel).toBe('hello');
        expect(props.seesElement).toBe(true);
    });

    it('falls back to defaults when transforms yield nullish values', () => {
        const element = new PropertyHarness({ provided: 0 });

        const props = element.snapshot({
            provided: {
                transform: () => undefined,
                defaultValue: 99,
            },
        });

        expect(props.provided).toBe(99);
    });
});
