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

    it('tracks save progress and clears it when the operation finishes', () => {
        useTemplateStatusStore.getState().startLoading('Saving scene…', { progress: 0 });
        useTemplateStatusStore.getState().updateLoading({ progress: 0.6, message: 'Packaging scene file…' });

        expect(useTemplateStatusStore.getState()).toMatchObject({
            isTemplateLoading: true,
            message: 'Packaging scene file…',
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
