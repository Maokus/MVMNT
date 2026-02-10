import { describe, expect, it } from 'vitest';
import {
	parseVersion,
	compareVersions,
	satisfiesRange,
	explainRange,
	type SemanticVersion,
} from '../version';

describe('version utilities', () => {
	describe('parseVersion', () => {
		it('parses valid semantic versions', () => {
			expect(parseVersion('1.2.3')).toEqual({
				major: 1,
				minor: 2,
				patch: 3,
			});

			expect(parseVersion('0.0.0')).toEqual({
				major: 0,
				minor: 0,
				patch: 0,
			});

			expect(parseVersion('10.20.30')).toEqual({
				major: 10,
				minor: 20,
				patch: 30,
			});
		});

		it('parses versions with prerelease tags', () => {
			expect(parseVersion('1.2.3-beta')).toEqual({
				major: 1,
				minor: 2,
				patch: 3,
				prerelease: 'beta',
			});

			expect(parseVersion('1.0.0-alpha.1')).toEqual({
				major: 1,
				minor: 0,
				patch: 0,
				prerelease: 'alpha.1',
			});
		});

		it('returns null for invalid versions', () => {
			expect(parseVersion('1.2')).toBeNull();
			expect(parseVersion('1')).toBeNull();
			expect(parseVersion('v1.2.3')).toBeNull();
			expect(parseVersion('1.2.3.4')).toBeNull();
			expect(parseVersion('abc')).toBeNull();
			expect(parseVersion('')).toBeNull();
		});
	});

	describe('compareVersions', () => {
		const v1_0_0: SemanticVersion = { major: 1, minor: 0, patch: 0 };
		const v1_2_3: SemanticVersion = { major: 1, minor: 2, patch: 3 };
		const v1_2_4: SemanticVersion = { major: 1, minor: 2, patch: 4 };
		const v1_3_0: SemanticVersion = { major: 1, minor: 3, patch: 0 };
		const v2_0_0: SemanticVersion = { major: 2, minor: 0, patch: 0 };

		it('compares by major version', () => {
			expect(compareVersions(v1_0_0, v2_0_0)).toBe(-1);
			expect(compareVersions(v2_0_0, v1_0_0)).toBe(1);
		});

		it('compares by minor version when major is equal', () => {
			expect(compareVersions(v1_2_3, v1_3_0)).toBe(-1);
			expect(compareVersions(v1_3_0, v1_2_3)).toBe(1);
		});

		it('compares by patch version when major and minor are equal', () => {
			expect(compareVersions(v1_2_3, v1_2_4)).toBe(-1);
			expect(compareVersions(v1_2_4, v1_2_3)).toBe(1);
		});

		it('returns 0 for equal versions', () => {
			expect(compareVersions(v1_2_3, v1_2_3)).toBe(0);
		});

		it('handles prerelease versions', () => {
			const v1_2_3_beta: SemanticVersion = { major: 1, minor: 2, patch: 3, prerelease: 'beta' };
			const v1_2_3_stable: SemanticVersion = { major: 1, minor: 2, patch: 3 };

			// Stable is greater than prerelease
			expect(compareVersions(v1_2_3_beta, v1_2_3_stable)).toBe(-1);
			expect(compareVersions(v1_2_3_stable, v1_2_3_beta)).toBe(1);
		});
	});

	describe('satisfiesRange', () => {
		it('handles exact version matches', () => {
			expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.3', '1.2.4')).toBe(false);
		});

		it('handles caret ranges (^)', () => {
			// ^1.2.3 allows >=1.2.3 <2.0.0
			expect(satisfiesRange('1.2.3', '^1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.4', '^1.2.3')).toBe(true);
			expect(satisfiesRange('1.9.9', '^1.2.3')).toBe(true);
			expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
			expect(satisfiesRange('1.2.2', '^1.2.3')).toBe(false);

			// ^0.2.3 allows >=0.2.3 <1.0.0
			expect(satisfiesRange('0.2.3', '^0.2.3')).toBe(true);
			expect(satisfiesRange('0.9.0', '^0.2.3')).toBe(true);
			expect(satisfiesRange('1.0.0', '^0.2.3')).toBe(false);
		});

		it('handles tilde ranges (~)', () => {
			// ~1.2.3 allows >=1.2.3 <1.3.0
			expect(satisfiesRange('1.2.3', '~1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.4', '~1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true);
			expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
			expect(satisfiesRange('1.2.2', '~1.2.3')).toBe(false);
		});

		it('handles greater than (>)', () => {
			expect(satisfiesRange('1.2.4', '>1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.3', '>1.2.3')).toBe(false);
			expect(satisfiesRange('1.2.2', '>1.2.3')).toBe(false);
		});

		it('handles greater than or equal (>=)', () => {
			expect(satisfiesRange('1.2.4', '>=1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.3', '>=1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.2', '>=1.2.3')).toBe(false);
		});

		it('handles less than (<)', () => {
			expect(satisfiesRange('1.2.2', '<1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.3', '<1.2.3')).toBe(false);
			expect(satisfiesRange('1.2.4', '<1.2.3')).toBe(false);
		});

		it('handles less than or equal (<=)', () => {
			expect(satisfiesRange('1.2.2', '<=1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.3', '<=1.2.3')).toBe(true);
			expect(satisfiesRange('1.2.4', '<=1.2.3')).toBe(false);
		});

		it('handles combined ranges', () => {
			// >=1.2.0 <2.0.0
			expect(satisfiesRange('1.2.0', '>=1.2.0 <2.0.0')).toBe(true);
			expect(satisfiesRange('1.9.9', '>=1.2.0 <2.0.0')).toBe(true);
			expect(satisfiesRange('1.1.9', '>=1.2.0 <2.0.0')).toBe(false);
			expect(satisfiesRange('2.0.0', '>=1.2.0 <2.0.0')).toBe(false);
		});

		it('returns false for invalid version strings', () => {
			expect(satisfiesRange('invalid', '1.2.3')).toBe(false);
			expect(satisfiesRange('1.2.3', 'invalid')).toBe(false);
		});
	});

	describe('explainRange', () => {
		it('explains caret ranges', () => {
			expect(explainRange('^1.2.3')).toBe('compatible with version 1.2.3 (same major version)');
		});

		it('explains tilde ranges', () => {
			expect(explainRange('~1.2.3')).toBe('compatible with version 1.2.3 (same minor version)');
		});

		it('explains comparison operators', () => {
			expect(explainRange('>=1.2.3')).toBe('version >=1.2.3');
			expect(explainRange('>1.2.3')).toBe('version >1.2.3');
			expect(explainRange('<=1.2.3')).toBe('version <=1.2.3');
			expect(explainRange('<2.0.0')).toBe('version <2.0.0');
		});

		it('explains exact versions', () => {
			expect(explainRange('1.2.3')).toBe('exactly version 1.2.3');
		});
	});
});
