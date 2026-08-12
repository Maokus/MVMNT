export type BuildChannel = 'development' | 'nightly' | 'stable';

export interface BuildInfo {
    version: string;
    displayVersion: string;
    channel: BuildChannel;
    commit: string;
    builtAt: string;
    isPackaged: boolean;
    updateChecksEnabled: boolean;
}

export type UpdateCheckResult =
    | { status: 'available'; latestVersion: string; downloadUrl: string }
    | { status: 'current'; latestVersion: string }
    | { status: 'disabled' }
    | { status: 'error' };

export interface BuildInfoInput {
    version: string;
    channel: BuildChannel;
    commit: string;
    builtAt: string;
    isPackaged: boolean;
    platform?: string;
}

export function formatDisplayVersion(version: string, channel: BuildChannel, commit: string): string {
    if (channel === 'development') return `${version}-dev+${commit}`;
    return version;
}

export function createBuildInfo(input: BuildInfoInput): BuildInfo {
    return {
        version: input.version,
        displayVersion: formatDisplayVersion(input.version, input.channel, input.commit),
        channel: input.channel,
        commit: input.commit,
        builtAt: input.builtAt,
        isPackaged: input.isPackaged,
        updateChecksEnabled:
            input.channel === 'stable' &&
            input.isPackaged &&
            (input.platform === 'darwin' || input.platform === 'win32'),
    };
}

export function compareStableVersions(left: string, right: string): number | null {
    const parse = (value: string) => {
        const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
        return match ? match.slice(1).map(Number) : null;
    };
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) return null;
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
    }
    return 0;
}

export function resolveUpdateAvailability(
    currentVersion: string,
    release: { tag_name?: unknown; draft?: unknown; prerelease?: unknown },
    downloadUrl: string
): UpdateCheckResult {
    if (release.draft === true || release.prerelease === true || typeof release.tag_name !== 'string') {
        return { status: 'error' };
    }
    const comparison = compareStableVersions(currentVersion, release.tag_name);
    if (comparison === null) return { status: 'error' };
    const latestVersion = release.tag_name.replace(/^v/, '');
    return comparison < 0 ? { status: 'available', latestVersion, downloadUrl } : { status: 'current', latestVersion };
}
