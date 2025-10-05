import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => ({
    // Use a dynamic base so the app can be hosted under a sub-path in production
    // Production target path: https://maok.us/playbox/projects/mvmnt/
    // Local dev remains at root '/'
    base: mode === 'production' ? '/playbox/projects/mvmnt/' : mode === 'beta' ? '/playbox/projects/mvmnt_beta/' : '/',
    optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        },
    },
    // React SWC plugin already enables Fast Refresh by default; ensure our component
    // modules use named function declarations for providers for consistent boundaries.
    plugins: [react(), tsconfigPaths()],
    assetsInclude: ['**/*.icns'],
    build: {
        outDir: 'build',
        sourcemap: true,
    },
    define: {
        'process.env': {}, // lightweight shim
    },
    alias: {
        '@': path.resolve(__dirname, 'src'), // optional shortcut
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        globals: true,
        include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
        assetsInclude: ['**/*.icns'],
    },
}));
