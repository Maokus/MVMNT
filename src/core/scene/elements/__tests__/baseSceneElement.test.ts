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

const featureControllerMocks = vi.hoisted(() => {
    const store = new Map<object, any>();

    const createController = () => ({
        setStaticRequirements: vi.fn(),
        updateTrack: vi.fn(),
        registerAdHocDescriptor: vi.fn(),
        syncExplicitDescriptors: vi.fn(),
        getActiveTrackId: vi.fn(() => null),
        getSubscriptionSnapshot: vi.fn(() => []),
        clear: vi.fn(),
    });

    return {
        store,
        createController,
    };
});

vi.mock('@audio/features/featureSubscriptionController', () => {
    const { store, createController } = featureControllerMocks;
    return {
        getFeatureSubscriptionController: vi.fn((element: object) => {
            let controller = store.get(element);
            if (!controller) {
                controller = createController();
                store.set(element, controller);
            }
            return controller;
        }),
        peekFeatureSubscriptionController: vi.fn((element: object) => store.get(element) ?? null),
        releaseFeatureSubscriptionController: vi.fn((element: object) => {
            store.delete(element);
        }),
        resetFeatureSubscriptionControllersForTests: vi.fn(() => {
            store.clear();
        }),
        normalizeTrackId: (value: string | null | undefined) => {
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        },
    };
});

import { SceneElement, asBoolean, asNumber, asTrimmedString } from '@core/scene/elements/base';
import * as sceneApi from '@audio/features/sceneApi';
import { registerFeatureRequirements, resetFeatureRequirementsForTests } from '@audio/audioElementMetadata';
import * as macroSyncService from '@state/scene/macroSyncService';
import { getFeatureSubscriptionController } from '@audio/features/featureSubscriptionController';

beforeEach(() => {
    resetFeatureRequirementsForTests();
    featureControllerMocks.store.clear();
    vi.mocked(getFeatureSubscriptionController).mockClear();
    (macroSyncService as any).__resetMacroTestHarness?.();
});

afterEach(() => {
    resetFeatureRequirementsForTests();
    featureControllerMocks.store.clear();
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
        const controller = featureControllerMocks.store.get(element as object);
        expect(controller?.setStaticRequirements).toHaveBeenCalledWith([{ feature: 'spectrogram' }]);
        expect(controller?.updateTrack).toHaveBeenCalledWith('track-1');
    });

    it('resubscribes when the track id changes', () => {
        registerFeatureRequirements('audioTest', [{ feature: 'rms' }]);

        class AudioTestElement extends SceneElement {
            constructor(config: Record<string, unknown> = {}) {
                super('audioTest', 'el-2', config);
            }
        }

        const element = new AudioTestElement({ audioTrackId: 'initial' });
        const controller = featureControllerMocks.store.get(element as object)!;
        controller.setStaticRequirements.mockClear();
        controller.updateTrack.mockClear();

        element.updateConfig({ audioTrackId: 'next-track' });

        expect(controller.setStaticRequirements).toHaveBeenCalledWith([{ feature: 'rms' }]);
        expect(controller.updateTrack).toHaveBeenCalledWith('next-track');
    });

    it('clears subscriptions when the track id is removed', () => {
        registerFeatureRequirements('audioTest', [{ feature: 'waveform' }]);

        class AudioTestElement extends SceneElement {
            constructor(config: Record<string, unknown> = {}) {
                super('audioTest', 'el-3', config);
            }
        }

        const element = new AudioTestElement({ audioTrackId: 'keep-me' });
        const controller = featureControllerMocks.store.get(element as object)!;
        controller.updateTrack.mockClear();

        element.updateConfig({ audioTrackId: null });

        expect(controller.updateTrack).toHaveBeenCalledWith(null);
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

        const controller = featureControllerMocks.store.get(element as object)!;
        controller.updateTrack.mockClear();

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

        expect(controller.updateTrack).toHaveBeenCalledWith('track-next');

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
