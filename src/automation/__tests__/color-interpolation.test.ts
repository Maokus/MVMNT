import { describe, it, expect } from 'vitest';
import { parseColor, formatColor, lerpColor } from '../color-interpolation';

describe('color-interpolation', () => {
    describe('parseColor', () => {
        it('parses 6-digit hex', () => {
            expect(parseColor('#ff0000')).toEqual([255, 0, 0, 255]);
            expect(parseColor('#00ff00')).toEqual([0, 255, 0, 255]);
            expect(parseColor('#0000ff')).toEqual([0, 0, 255, 255]);
        });

        it('parses 8-digit hex with alpha', () => {
            expect(parseColor('#ff000080')).toEqual([255, 0, 0, 128]);
        });

        it('parses 3-digit shorthand', () => {
            expect(parseColor('#f00')).toEqual([255, 0, 0, 255]);
        });

        it('handles missing # prefix', () => {
            expect(parseColor('ff0000')).toEqual([255, 0, 0, 255]);
        });
    });

    describe('formatColor', () => {
        it('formats to 6-digit hex', () => {
            expect(formatColor([255, 0, 0, 255])).toBe('#ff0000');
            expect(formatColor([0, 128, 255, 255])).toBe('#0080ff');
        });

        it('includes alpha when requested and alpha < 255', () => {
            expect(formatColor([255, 0, 0, 128], true)).toBe('#ff000080');
        });

        it('omits alpha when full opacity even if requested', () => {
            expect(formatColor([255, 0, 0, 255], true)).toBe('#ff0000');
        });

        it('clamps values to 0-255', () => {
            expect(formatColor([300, -10, 128, 255])).toBe('#ff0080');
        });
    });

    describe('lerpColor', () => {
        it('returns start color at t=0', () => {
            expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
        });

        it('returns end color at t=1', () => {
            expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
        });

        it('interpolates at midpoint', () => {
            const mid = lerpColor('#000000', '#ffffff', 0.5);
            const r = parseInt(mid.slice(1, 3), 16);
            expect(r).toBeGreaterThanOrEqual(127);
            expect(r).toBeLessThanOrEqual(128);
        });

        it('interpolates individual channels', () => {
            const result = lerpColor('#ff0000', '#00ff00', 0.5);
            const r = parseInt(result.slice(1, 3), 16);
            const g = parseInt(result.slice(3, 5), 16);
            const b = parseInt(result.slice(5, 7), 16);
            expect(r).toBeGreaterThanOrEqual(127);
            expect(r).toBeLessThanOrEqual(128);
            expect(g).toBeGreaterThanOrEqual(127);
            expect(g).toBeLessThanOrEqual(128);
            expect(b).toBe(0);
        });
    });
});
