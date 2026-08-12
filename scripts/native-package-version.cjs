function nativePackageVersions(packageVersion, channel, buildNumber = '0') {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(packageVersion);
    if (!match) throw new Error(`Cannot derive a native version from ${packageVersion}.`);
    const appVersion = `${match[1]}.${match[2]}.${match[3]}`;
    if (channel !== 'nightly') return { appVersion, buildVersion: appVersion };
    if (!/^\d+$/.test(buildNumber) || Number(buildNumber) > 65_535) {
        throw new Error('MVMNT_NIGHTLY_BUILD_NUMBER must be an integer between 0 and 65535.');
    }
    return { appVersion, buildVersion: `${appVersion}.${Number(buildNumber)}` };
}

module.exports = { nativePackageVersions };
