import { describe, expect, it } from 'vitest';
import { getCanvasRenderScale } from '../canvasRenderScale';

describe('getCanvasRenderScale', () => {
    it('preserves the device pixel ratio for ordinary clip previews', () => {
        expect(getCanvasRenderScale(800, 40, 2)).toBe(2);
    });

    it('caps a highly zoomed preview backing store to a safe width', () => {
        const scale = getCanvasRenderScale(100_000, 40, 2);

        expect(Math.floor(100_000 * scale)).toBeLessThanOrEqual(8192);
        expect(scale).toBeLessThan(1);
    });

    it('caps backing-store area for unusually large previews', () => {
        const scale = getCanvasRenderScale(8000, 8000, 2);

        expect(Math.floor(8000 * scale) * Math.floor(8000 * scale)).toBeLessThanOrEqual(16 * 1024 * 1024);
    });
});
