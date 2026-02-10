import { describe, it, expect, beforeEach, vi } from 'vitest';
import { satisfiesVersion } from '@core/scene/plugins/version-check';

describe('version-check', () => {
    describe('satisfiesVersion', () => {
        it('handles exact version matches', () => {
            expect(satisfiesVersion('1.0.0', '1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.0', '1.0.1')).toBe(false);
            expect(satisfiesVersion('1.0.1', '1.0.0')).toBe(false);
        });

        it('handles caret ranges (^)', () => {
            // ^1.0.0 means >=1.0.0 <2.0.0
            expect(satisfiesVersion('1.0.0', '^1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.5', '^1.0.0')).toBe(true);
            expect(satisfiesVersion('1.5.0', '^1.0.0')).toBe(true);
            expect(satisfiesVersion('2.0.0', '^1.0.0')).toBe(false);
            expect(satisfiesVersion('0.9.9', '^1.0.0')).toBe(false);

            // ^0.x.y means >=0.x.y <0.(x+1).0
            expect(satisfiesVersion('0.14.0', '^0.14.0')).toBe(true);
            expect(satisfiesVersion('0.14.5', '^0.14.0')).toBe(true);
            expect(satisfiesVersion('0.15.0', '^0.14.0')).toBe(false);
            expect(satisfiesVersion('0.13.9', '^0.14.0')).toBe(false);
        });

        it('handles tilde ranges (~)', () => {
            // ~1.0.0 means >=1.0.0 <1.1.0
            expect(satisfiesVersion('1.0.0', '~1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.5', '~1.0.0')).toBe(true);
            expect(satisfiesVersion('1.1.0', '~1.0.0')).toBe(false);
            expect(satisfiesVersion('0.9.9', '~1.0.0')).toBe(false);
        });

        it('handles >= operator', () => {
            expect(satisfiesVersion('1.0.0', '>=1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.1', '>=1.0.0')).toBe(true);
            expect(satisfiesVersion('1.5.0', '>=1.0.0')).toBe(true);
            expect(satisfiesVersion('0.9.9', '>=1.0.0')).toBe(false);
        });

        it('handles > operator', () => {
            expect(satisfiesVersion('1.0.1', '>1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.0', '>1.0.0')).toBe(false);
            expect(satisfiesVersion('0.9.9', '>1.0.0')).toBe(false);
        });

        it('handles <= operator', () => {
            expect(satisfiesVersion('1.0.0', '<=1.0.0')).toBe(true);
            expect(satisfiesVersion('0.9.9', '<=1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.1', '<=1.0.0')).toBe(false);
        });

        it('handles < operator', () => {
            expect(satisfiesVersion('0.9.9', '<1.0.0')).toBe(true);
            expect(satisfiesVersion('1.0.0', '<1.0.0')).toBe(false);
            expect(satisfiesVersion('1.0.1', '<1.0.0')).toBe(false);
        });

        it('handles compound ranges', () => {
            // >=1.0.0 <2.0.0
            expect(satisfiesVersion('1.0.0', '>=1.0.0 <2.0.0')).toBe(true);
            expect(satisfiesVersion('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
            expect(satisfiesVersion('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
            expect(satisfiesVersion('0.9.9', '>=1.0.0 <2.0.0')).toBe(false);
        });

        it('handles OR conditions (||)', () => {
            expect(satisfiesVersion('1.0.0', '1.0.0 || 2.0.0')).toBe(true);
            expect(satisfiesVersion('2.0.0', '1.0.0 || 2.0.0')).toBe(true);
            expect(satisfiesVersion('1.5.0', '1.0.0 || 2.0.0')).toBe(false);
        });

        it('handles invalid version strings', () => {
            expect(satisfiesVersion('invalid', '1.0.0')).toBe(false);
            expect(satisfiesVersion('1.0.0', 'invalid')).toBe(false);
        });

        it('handles MVMNT version compatibility', () => {
            const currentVersion = '0.14.0';
            expect(satisfiesVersion(currentVersion, '^0.14.0')).toBe(true);
            expect(satisfiesVersion(currentVersion, '>=0.14.0')).toBe(true);
            expect(satisfiesVersion(currentVersion, '>=0.14.0 <1.0.0')).toBe(true);
            expect(satisfiesVersion(currentVersion, '^0.13.0')).toBe(false);
            expect(satisfiesVersion(currentVersion, '^0.15.0')).toBe(false);
        });
    });
});
