import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisualResourceCache } from '../visual-resource-cache';

describe('VisualResourceCache', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('notifies subscribers when an image finishes loading', async () => {
        const image = {
            crossOrigin: '',
            naturalWidth: 20,
            naturalHeight: 10,
            width: 20,
            height: 10,
            onload: null as null | (() => void),
            onerror: null,
            set src(_value: string) {
                queueMicrotask(() => this.onload?.());
            },
        };
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'img') return image as unknown as HTMLImageElement;
            return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
        }) as typeof document.createElement);
        const onImageLoaded = vi.fn();

        const cache = new VisualResourceCache();
        const unsubscribe = cache.subscribeToLoads(onImageLoaded);
        await cache.load({ kind: 'image', src: 'test.png' });

        expect(onImageLoaded).toHaveBeenCalledTimes(1);
        expect(onImageLoaded).toHaveBeenCalledWith(expect.objectContaining({ key: 'image:test.png', status: 'ready' }));
        unsubscribe();
    });
});
