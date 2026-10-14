import { describe, expect, it } from 'vitest';
import { clampPopupToViewport } from '../popupPosition';

describe('clampPopupToViewport', () => {
    it('passes through positions inside the viewport', () => {
        expect(clampPopupToViewport({ x: 100, y: 50 }, 320, 1280)).toEqual({ x: 100, y: 50 });
    });

    it('clamps right overflow to viewport minus popup and margin', () => {
        expect(clampPopupToViewport({ x: 1200, y: 50 }, 320, 1280)).toEqual({ x: 952, y: 50 });
    });

    it('clamps left overflow up to the margin (lower-bound fix)', () => {
        expect(clampPopupToViewport({ x: -40, y: 50 }, 320, 1280)).toEqual({ x: 8, y: 50 });
    });

    it('clamps both axes when popup size and viewport are known', () => {
        expect(clampPopupToViewport({ x: 1200, y: 900 }, 320, 1280, 200, 800)).toEqual({ x: 952, y: 592 });
    });
});
