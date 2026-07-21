import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => {
    return {
        // The renderer is served by Electron's mvmnt:// protocol in packaged builds.
        base: '/',
        optimizeDeps: {
            exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
        },
        // React SWC plugin already enables Fast Refresh by default; ensure our component
        // modules use named function declarations for providers for consistent boundaries.
        plugins: [react(), tsconfigPaths()],
        assetsInclude: ['**/*.icns', '**/*.mvt'],
        build: {
            outDir: 'dist/renderer',
            sourcemap: true,
        },
        define: { 'process.env': {} }, // lightweight shim
        test: {
            environment: 'jsdom',
            setupFiles: ['./src/setupTests.ts'],
            globals: true,
            include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
            assetsInclude: ['**/*.icns', '**/*.mvt'],
        },
    };
});
