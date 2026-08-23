import { beforeEach, describe, expect, it } from 'vitest';
import { useTemplateStatusStore } from '../templateStatusStore';

describe('template status store', () => {
    beforeEach(() => {
        useTemplateStatusStore.setState({
            isTemplateLoading: false,
            message: 'Loading template…',
            progress: null,
            pendingCount: 0,
            onAbort: null,
        });
    });

    it('tracks blocking load progress and clears it when the operation finishes', () => {
        useTemplateStatusStore.getState().startLoading('Loading scene…', { progress: 0 });
        useTemplateStatusStore.getState().updateLoading({ progress: 0.6, message: 'Hydrating scene assets…' });

        expect(useTemplateStatusStore.getState()).toMatchObject({
            isTemplateLoading: true,
            message: 'Hydrating scene assets…',
            progress: 0.6,
        });

        useTemplateStatusStore.getState().finishLoading();
        expect(useTemplateStatusStore.getState()).toMatchObject({
            isTemplateLoading: false,
            progress: null,
            onAbort: null,
        });
    });
});
