/**
 * Semantic versioning utilities for plugin compatibility checking.
 */

/**
 * Parse a semantic version string into components.
 */
export interface SemanticVersion {
	major: number;
	minor: number;
	patch: number;
	prerelease?: string;
}

/**
 * Parse a semantic version string.
 * @param version - Version string (e.g., "1.2.3", "1.0.0-beta.1")
 * @returns Parsed version object or null if invalid
 */
export function parseVersion(version: string): SemanticVersion | null {
	const match = version.match(
		/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/
	);
	if (!match) {
		return null;
	}

	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		prerelease: match[4],
	};
}

/**
 * Compare two semantic versions.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(
	a: SemanticVersion,
	b: SemanticVersion
): number {
	if (a.major !== b.major) {
		return a.major < b.major ? -1 : 1;
	}
	if (a.minor !== b.minor) {
		return a.minor < b.minor ? -1 : 1;
	}
	if (a.patch !== b.patch) {
		return a.patch < b.patch ? -1 : 1;
	}

	// Handle prerelease comparison
	// Versions without prerelease are greater than versions with prerelease
	if (!a.prerelease && b.prerelease) {
		return 1;
	}
	if (a.prerelease && !b.prerelease) {
		return -1;
	}
	if (a.prerelease && b.prerelease) {
		return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0;
	}

	return 0;
}

/**
 * Check if a version satisfies a version range.
 *
 * Supported range formats:
 * - Exact: "1.2.3"
 * - Caret: "^1.2.3" (allows changes that do not modify the left-most non-zero digit)
 * - Tilde: "~1.2.3" (allows patch-level changes if minor is specified)
 * - Greater than: ">1.2.3", ">=1.2.3"
 * - Less than: "<2.0.0", "<=2.0.0"
 * - Combined: ">=1.2.0 <2.0.0"
 *
 * @param version - Version string to check
 * @param range - Version range specifier
 * @returns True if version satisfies the range
 */
export function satisfiesRange(version: string, range: string): boolean {
	const parsedVersion = parseVersion(version);
	if (!parsedVersion) {
		return false;
	}

	// Handle multiple range parts (e.g., ">=1.2.0 <2.0.0")
	const rangeParts = range.trim().split(/\s+/);

	return rangeParts.every((part) => satisfiesSingleRange(parsedVersion, part));
}

/**
 * Check if a version satisfies a single range constraint.
 */
function satisfiesSingleRange(
	version: SemanticVersion,
	range: string
): boolean {
	// Caret range (^): ^1.2.3 := >=1.2.3 <2.0.0
	if (range.startsWith("^")) {
		const rangeVersion = parseVersion(range.slice(1));
		if (!rangeVersion) {
			return false;
		}

		// Must be >= range version
		if (compareVersions(version, rangeVersion) < 0) {
			return false;
		}

		// Must be < next major version
		const nextMajor: SemanticVersion = {
			major: rangeVersion.major + 1,
			minor: 0,
			patch: 0,
		};
		return compareVersions(version, nextMajor) < 0;
	}

	// Tilde range (~): ~1.2.3 := >=1.2.3 <1.3.0
	if (range.startsWith("~")) {
		const rangeVersion = parseVersion(range.slice(1));
		if (!rangeVersion) {
			return false;
		}

		// Must be >= range version
		if (compareVersions(version, rangeVersion) < 0) {
			return false;
		}

		// Must be < next minor version
		const nextMinor: SemanticVersion = {
			major: rangeVersion.major,
			minor: rangeVersion.minor + 1,
			patch: 0,
		};
		return compareVersions(version, nextMinor) < 0;
	}

	// Greater than or equal: >=1.2.3
	if (range.startsWith(">=")) {
		const rangeVersion = parseVersion(range.slice(2));
		if (!rangeVersion) {
			return false;
		}
		return compareVersions(version, rangeVersion) >= 0;
	}

	// Greater than: >1.2.3
	if (range.startsWith(">")) {
		const rangeVersion = parseVersion(range.slice(1));
		if (!rangeVersion) {
			return false;
		}
		return compareVersions(version, rangeVersion) > 0;
	}

	// Less than or equal: <=1.2.3
	if (range.startsWith("<=")) {
		const rangeVersion = parseVersion(range.slice(2));
		if (!rangeVersion) {
			return false;
		}
		return compareVersions(version, rangeVersion) <= 0;
	}

	// Less than: <1.2.3
	if (range.startsWith("<")) {
		const rangeVersion = parseVersion(range.slice(1));
		if (!rangeVersion) {
			return false;
		}
		return compareVersions(version, rangeVersion) < 0;
	}

	// Exact match (no operator)
	const rangeVersion = parseVersion(range);
	if (!rangeVersion) {
		return false;
	}
	return compareVersions(version, rangeVersion) === 0;
}

/**
 * Get a human-readable explanation of a version range.
 */
export function explainRange(range: string): string {
	if (range.startsWith("^")) {
		return `compatible with version ${range.slice(1)} (same major version)`;
	}
	if (range.startsWith("~")) {
		return `compatible with version ${range.slice(1)} (same minor version)`;
	}
	if (range.startsWith(">=") || range.startsWith(">") || range.startsWith("<=") || range.startsWith("<")) {
		return `version ${range}`;
	}
	return `exactly version ${range}`;
}
