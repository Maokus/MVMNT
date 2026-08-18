import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { buildMetadataDefines, readBuildMetadata } from './scripts/build-metadata.mjs';
import posthog from '@posthog/rollup-plugin';

export default defineConfig(() => {
    const buildMetadata = readBuildMetadata();
    const sourceMapUploadEnabled = Boolean(
        buildMetadata.channel !== 'development' && process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID
    );
    return {
        // The renderer is served by Electron's mvmnt:// protocol in packaged builds.
        base: '/',
        optimizeDeps: {
            exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
        },
        // React SWC plugin already enables Fast Refresh by default; ensure our component
        // modules use named function declarations for providers for consistent boundaries.
        plugins: [
            react(),
            tsconfigPaths(),
            ...(sourceMapUploadEnabled
                ? [
                      posthog({
                          personalApiKey: process.env.POSTHOG_API_KEY!,
                          projectId: process.env.POSTHOG_PROJECT_ID!,
                          host: 'https://eu.posthog.com',
                          sourcemaps: {
                              enabled: true,
                              releaseName: 'mvmnt-desktop',
                              releaseVersion: buildMetadata.version,
                              build: buildMetadata.commit,
                              deleteAfterUpload: true,
                          },
                      }),
                  ]
                : []),
        ],
        assetsInclude: ['**/*.icns', '**/*.mvt'],
        build: {
            outDir: 'dist/renderer',
            sourcemap: sourceMapUploadEnabled ? 'hidden' : false,
        },
        define: { 'process.env': {}, ...buildMetadataDefines(process.env, buildMetadata) }, // lightweight shim
        test: {
            environment: 'jsdom',
            setupFiles: ['./src/setupTests.ts'],
            globals: true,
            include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
            assetsInclude: ['**/*.icns', '**/*.mvt'],
        },
    };
});
