import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@audio/features/subscriptionSync', () => ({
    syncElementSubscriptions: vi.fn(),
    getElementSubscriptions: vi.fn(() => []),
    hasSubscription: vi.fn(() => false),
    isInRequirements: vi.fn(() => false),
    getElementSubscriptionDetails: vi.fn(() => []),
}));

import { SceneElement } from '@core/scene/elements/base';
import * as sceneApi from '@audio/features/sceneApi';
import {
    registerFeatureRequirements,
    resetFeatureRequirementsForTests,
} from '@core/scene/elements/audioElementMetadata';
import { syncElementSubscriptions } from '@audio/features/subscriptionSync';

const mockedSync = vi.mocked(syncElementSubscriptions);

beforeEach(() => {
    resetFeatureRequirementsForTests();
    mockedSync.mockClear();
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
});
