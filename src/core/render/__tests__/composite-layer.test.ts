import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompositeLayer } from '../render-objects/composite-layer';
import { renderResourceManager } from '../render-resource-manager';

describe('CompositeLayer', () => {
    afterEach(() => vi.restoreAllMocks());

    it('renders every child into one source before applying the output blend mode once', () => {
        const transform = {} as DOMMatrix;
        const offscreen = { setTransform: vi.fn(), translate: vi.fn() } as any;
        const release = vi.fn();
        const surface = { canvas: {} as OffscreenCanvas, context: offscreen, release };
        vi.spyOn(renderResourceManager, 'acquireScratch').mockReturnValue(surface);
        const target = {
            getTransform: vi.fn(() => transform),
            save: vi.fn(),
            restore: vi.fn(),
            resetTransform: vi.fn(),
            drawImage: vi.fn(),
            globalAlpha: 1,
            globalCompositeOperation: 'source-over',
        } as any;
        const first = { render: vi.fn() } as any;
        const second = { render: vi.fn() } as any;
        const layer = new CompositeLayer('multiply').addChildren([first, second]);

        layer.render(target, { canvas: { width: 100, height: 50 } as HTMLCanvasElement }, 0);

        expect(offscreen.setTransform).toHaveBeenCalledWith(transform);
        expect(first.render).toHaveBeenCalledWith(offscreen, expect.anything(), 0);
        expect(second.render).toHaveBeenCalledWith(offscreen, expect.anything(), 0);
        expect(target.globalCompositeOperation).toBe('multiply');
        expect(target.drawImage).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledOnce();
    });
});
