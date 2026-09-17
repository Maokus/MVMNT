import { afterEach, describe, expect, it } from 'vitest';

import {
    COLOR_FIELD_MODE_STORAGE_KEY,
    RECENT_COLORS_STORAGE_KEY,
    colorToHsva,
    generateBasePalette,
    generateTonePalette,
    hsvaToHex,
    hueFromPoint,
    loadColorFieldMode,
    loadRecentColors,
    normalizeRecentColors,
    preserveAchromaticHue,
    saveColorFieldMode,
    saturationValueFromPoint,
    storeRecentColor,
} from '../colorPickerUtils';

afterEach(() => {
    localStorage.removeItem(COLOR_FIELD_MODE_STORAGE_KEY);
    localStorage.removeItem(RECENT_COLORS_STORAGE_KEY);
});

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

    it('generates hue-specific tones and a balanced base palette', () => {
        const redTones = generateTonePalette(0);
        const blueTones = generateTonePalette(240);
        expect(redTones).toHaveLength(8);
        expect(new Set(redTones).size).toBe(8);
        expect(blueTones).toHaveLength(8);
        expect(blueTones).not.toEqual(redTones);

        const base = generateBasePalette();
        expect(base).toHaveLength(16);
        expect(base.slice(-8)).toEqual([
            '#FFFFFF',
            '#E0E0E0',
            '#BFBFBF',
            '#999999',
            '#737373',
            '#4D4D4D',
            '#262626',
            '#000000',
        ]);
    });

    it('stores eight recent colors newest-first and moves reused colors to the front', () => {
        for (let index = 0; index < 10; index += 1) {
            storeRecentColor(colorToHsva(`#${index.toString(16).padStart(2, '0')}0000`));
        }
        expect(loadRecentColors()).toHaveLength(8);
        expect(loadRecentColors()[0]).toBe('#090000');

        storeRecentColor(colorToHsva('#050000'));
        expect(loadRecentColors()[0]).toBe('#050000');
        expect(loadRecentColors().filter((color) => color === '#050000')).toHaveLength(1);
    });

    it('recovers safely from malformed recent colors and field preferences', () => {
        localStorage.setItem(RECENT_COLORS_STORAGE_KEY, '{bad json');
        expect(loadRecentColors()).toEqual([]);
        expect(normalizeRecentColors(['#fff', 'invalid', '#FFFFFF', '#000000'])).toEqual(['#FFFFFF', '#000000']);

        localStorage.setItem(COLOR_FIELD_MODE_STORAGE_KEY, 'lab');
        expect(loadColorFieldMode()).toBe('hsv');
        saveColorFieldMode('rgb');
        expect(loadColorFieldMode()).toBe('rgb');
    });
});
