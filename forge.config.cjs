const path = require('node:path');
const packageManifest = require('./package.json');
const { nativePackageVersions } = require('./scripts/native-package-version.cjs');

const isNightly = process.env.MVMNT_BUILD_CHANNEL === 'nightly';
const productName = isNightly ? 'MVMNT Nightly' : 'MVMNT';
const executableName = isNightly ? 'MVMNT Nightly' : 'MVMNT';
const packageVersion = packageManifest.version;
const nightlyBuildNumber = process.env.MVMNT_NIGHTLY_BUILD_NUMBER || '0';
const { appVersion: nativeAppVersion, buildVersion: nativeBuildVersion } = nativePackageVersions(
    packageVersion,
    isNightly ? 'nightly' : 'stable',
    nightlyBuildNumber
);

const notarize =
    process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
        ? {
              appleId: process.env.APPLE_ID,
              appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
              teamId: process.env.APPLE_TEAM_ID,
          }
        : undefined;

module.exports = {
    packagerConfig: {
        name: productName,
        executableName,
        appBundleId: isNightly ? 'us.maok.mvmnt.nightly' : 'us.maok.mvmnt',
        // Native Windows/macOS version resources only accept numeric components.
        // The full SemVer prerelease remains in package.json and injected build metadata.
        appVersion: nativeAppVersion,
        buildVersion: nativeBuildVersion,
        appCategoryType: 'public.app-category.graphics-design',
        icon: path.resolve(__dirname, 'src/assets/Icon'),
        asar: true,
        prune: false,
        electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
        // CI can explicitly disable signing for builds that do not have release certificates.
        osxSign: process.env.CI && !process.env.MVMNT_SKIP_MAC_SIGNING ? {} : undefined,
        osxNotarize: notarize,
        protocols: isNightly ? [] : [{ name: 'MVMNT Project', schemes: ['mvmnt'] }],
        extendInfo: {
            CFBundleDocumentTypes: isNightly
                ? []
                : [
                      {
                          CFBundleTypeName: 'MVMNT Project',
                          CFBundleTypeExtensions: ['mvt'],
                          CFBundleTypeRole: 'Editor',
                          LSHandlerRank: 'Owner',
                      },
                      {
                          CFBundleTypeName: 'MVMNT Plugin',
                          CFBundleTypeExtensions: ['mvmnt-plugin'],
                          CFBundleTypeRole: 'Viewer',
                          LSHandlerRank: 'Owner',
                      },
                  ],
        },
        ignore: [
            /^\/\.git($|\/)/,
            /^\/\.github($|\/)/,
            /^\/\.vscode($|\/)/,
            /^\/\.env($|\.)/,
            /^\/\.gitignore$/,
            /^\/\.prettierrc$/,
            /^\/node_modules($|\/)/,
            /^\/docs($|\/)/,
            /^\/devscripts($|\/)/,
            /^\/fixtures($|\/)/,
            /^\/test_assets($|\/)/,
            /^\/thoughts($|\/)/,
            /^\/src($|\/)/,
            /^\/packages($|\/)/,
            /^\/electron($|\/)/,
            /^\/scripts($|\/)/,
            /^\/supabase($|\/)/,
            /^\/out($|\/)/,
            /^\/public($|\/)/,
            /^\/index\.html$/,
            /^\/package-lock\.json$/,
            /^\/forge\.config\.cjs$/,
            /^\/vite\.config\.ts$/,
            /^\/tsconfig\.json$/,
            /^\/(AGENTS|CLAUDE|README)\.md$/,
            /^\/(knip|postcss|tailwind)\..+$/,
            /^\/output\.txt$/,
        ],
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: isNightly ? 'mvmnt-nightly' : 'mvmnt',
                setupExe: isNightly
                    ? `MVMNT-Nightly-Setup-${packageVersion}-windows-x64.exe`
                    : `MVMNT-Setup-${packageVersion}-windows-x64.exe`,
                setupIcon: path.resolve(__dirname, 'src/assets/Icon.ico'),
                certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
                certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
            },
        },
        { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
        {
            name: '@electron-forge/maker-dmg',
            config: {
                format: 'ULFO',
            },
            platforms: ['darwin'],
        },
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: { owner: 'Maokus', name: 'MVMNT' },
                prerelease: false,
                draft: true,
            },
        },
    ],
};
