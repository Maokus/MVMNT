import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

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
    plugins: [react()],
    build: {
        outDir: 'build',
        sourcemap: true,
    },
    define: {
        'process.env': {}, // lightweight shim
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        globals: true,
        include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    },
}));
