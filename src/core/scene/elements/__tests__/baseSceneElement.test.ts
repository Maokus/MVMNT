import { describe, expect, it, vi } from 'vitest';
import { SceneElement } from '@core/scene/elements/base';
import * as sceneApi from '@audio/features/sceneApi';

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
