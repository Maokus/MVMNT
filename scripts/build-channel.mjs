export function resolveBuildChannel(requestedChannel) {
    if (requestedChannel === undefined) return 'development';
    if (requestedChannel === 'development' || requestedChannel === 'nightly' || requestedChannel === 'stable') {
        return requestedChannel;
    }
    throw new Error(`Invalid MVMNT_BUILD_CHANNEL: ${requestedChannel}`);
}
