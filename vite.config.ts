import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => ({
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
