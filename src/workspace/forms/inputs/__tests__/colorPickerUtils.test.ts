import { describe, expect, it } from 'vitest';

import {
    colorToHsva,
    hsvaToHex,
    hueFromPoint,
    preserveAchromaticHue,
    saturationValueFromPoint,
} from '../colorPickerUtils';

describe('colorPickerUtils', () => {
    it('round-trips primary and shorthand colors through HSVA', () => {
        expect(hsvaToHex(colorToHsva('#FF0000'))).toBe('#FF0000');
        expect(hsvaToHex(colorToHsva('#0F0'))).toBe('#00FF00');
        expect(hsvaToHex(colorToHsva('#0000FFFF'), true)).toBe('#0000FFFF');
    });

    it('preserves the previous hue for achromatic colors', () => {
        const yellow = colorToHsva('#FFFF00');
        expect(preserveAchromaticHue(yellow, colorToHsva('#FFFFFF')).h).toBeCloseTo(60);
        expect(preserveAchromaticHue(yellow, colorToHsva('#000000')).h).toBeCloseTo(60);
        expect(preserveAchromaticHue(yellow, colorToHsva('#00FFFF')).h).toBeCloseTo(180);
    });

    it('clamps pointer positions to picker bounds', () => {
        const bounds = { left: 10, top: 20, width: 200, height: 100 };
        expect(saturationValueFromPoint(-100, -100, bounds)).toEqual({ s: 0, v: 100 });
        expect(saturationValueFromPoint(500, 500, bounds)).toEqual({ s: 100, v: 0 });
        expect(hueFromPoint(110, bounds)).toBe(180);
    });
});
