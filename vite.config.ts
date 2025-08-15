import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ mode }) => ({
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
    plugins: [react()],
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
    },
}));
