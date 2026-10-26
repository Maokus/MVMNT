import { createBuildInfo } from '../../electron/shared/build-info';

export { shouldEnableDevelopmentTools } from '../../electron/shared/build-info';

export const BUILD_INFO = createBuildInfo({
    version: __MVMNT_VERSION__,
    channel: __MVMNT_BUILD_CHANNEL__,
    commit: __MVMNT_BUILD_SHA__,
    builtAt: __MVMNT_BUILD_DATE__,
    isPackaged: __MVMNT_BUILD_CHANNEL__ !== 'development',
});

export async function readRuntimeBuildInfo() {
    try {
        return (await window.mvmntDesktop?.app.getBuildInfo()) ?? BUILD_INFO;
    } catch {
        return BUILD_INFO;
    }
}
