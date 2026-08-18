export type BuildChannel = 'development' | 'nightly' | 'stable';

export function resolveBuildChannel(requestedChannel: string | undefined): BuildChannel;
