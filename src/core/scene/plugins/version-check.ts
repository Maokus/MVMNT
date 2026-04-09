/**
 * Simple semver range checker for plugin compatibility
 * Supports basic ranges: ^1.0.0, ~1.0.0, >=1.0.0, >=1.0.0 <2.0.0, 1.0.0
 */

interface Version {
    major: number;
    minor: number;
    patch: number;
}

function parseVersion(version: string): Version | null {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
    };
}

function compareVersions(a: Version, b: Version): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

/**
 * Check if a version satisfies a semver range
 * @param version The version to check (e.g., "0.14.0")
 * @param range The semver range (e.g., "^0.14.0", ">=0.14.0", ">=0.14.0 <1.0.0")
 * @returns true if the version satisfies the range
 */
export function satisfiesVersion(version: string, range: string): boolean {
    const ver = parseVersion(version);
    if (!ver) return false;

    // Handle OR conditions (||)
    if (range.includes('||')) {
        return range.split('||').some((r) => satisfiesVersion(version, r.trim()));
    }

    // Handle AND conditions (space-separated)
    const parts = range.trim().split(/\s+/);
    
    if (parts.length === 1) {
        const part = parts[0];
        
        // Caret range: ^1.0.0 means >=1.0.0 <2.0.0
        if (part.startsWith('^')) {
            const target = parseVersion(part.slice(1));
            if (!target) return false;
            if (target.major === 0) {
                // ^0.x.y means >=0.x.y <0.(x+1).0
                return ver.major === 0 && ver.minor === target.minor && ver.patch >= target.patch;
            }
            // ^x.y.z means >=x.y.z <(x+1).0.0
            return ver.major === target.major && compareVersions(ver, target) >= 0;
        }
        
        // Tilde range: ~1.0.0 means >=1.0.0 <1.1.0
        if (part.startsWith('~')) {
            const target = parseVersion(part.slice(1));
            if (!target) return false;
            return ver.major === target.major && ver.minor === target.minor && ver.patch >= target.patch;
        }
        
        // Exact version
        if (!part.includes('>') && !part.includes('<')) {
            const target = parseVersion(part);
            if (!target) return false;
            return compareVersions(ver, target) === 0;
        }
    }
    
    // Handle comparison operators
    return parts.every((part) => {
        if (part.startsWith('>=')) {
            const target = parseVersion(part.slice(2));
            return target && compareVersions(ver, target) >= 0;
        }
        if (part.startsWith('>')) {
            const target = parseVersion(part.slice(1));
            return target && compareVersions(ver, target) > 0;
        }
        if (part.startsWith('<=')) {
            const target = parseVersion(part.slice(2));
            return target && compareVersions(ver, target) <= 0;
        }
        if (part.startsWith('<')) {
            const target = parseVersion(part.slice(1));
            return target && compareVersions(ver, target) < 0;
        }
        // Treat as exact version
        const target = parseVersion(part);
        return target && compareVersions(ver, target) === 0;
    });
}
