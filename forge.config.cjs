const path = require('node:path');

const notarize = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
    ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    }
    : undefined;

module.exports = {
    packagerConfig: {
        name: 'MVMNT',
        executableName: 'MVMNT',
        appBundleId: 'us.maok.mvmnt',
        appCategoryType: 'public.app-category.graphics-design',
        icon: path.resolve(__dirname, 'src/assets/Icon'),
        asar: true,
        prune: false,
        electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
        // Testing builds run in CI without release certificates; release builds retain signing.
        osxSign: process.env.CI && !process.env.MVMNT_SKIP_MAC_SIGNING ? {} : undefined,
        osxNotarize: notarize,
        protocols: [
            { name: 'MVMNT Project', schemes: ['mvmnt'] },
        ],
        extendInfo: {
            CFBundleDocumentTypes: [
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
                name: 'mvmnt',
                setupExe: 'MVMNT-Setup.exe',
                setupIcon: path.resolve(__dirname, 'src/assets/Icon.ico'),
                certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
                certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
            },
        },
        { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
        {
            name: '@electron-forge/maker-dmg',
            config: {
                name: 'MVMNT',
                format: 'ULFO',
                // appdmg's HFS+ path runs `bless` before cleanup, which can remove the
                // mount path on current GitHub-hosted macOS runners. APFS skips that
                // obsolete step and is supported by the macOS 14 CI runner.
                additionalDMGOptions: { filesystem: 'APFS' },
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
