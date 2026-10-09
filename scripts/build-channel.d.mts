export type BuildChannel = 'development' | 'nightly' | 'stable';

export function resolveBuildChannel(requestedChannel: string | undefined): BuildChannel;
export function resolvePackagedBuildChannel(requestedChannel: string | undefined): BuildChannel;
