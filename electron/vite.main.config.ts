import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const electronDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    publicDir: false,
    build: {
        outDir: 'dist/electron',
        emptyOutDir: true,
        lib: {
            entry: {
                main: resolve(electronDirectory, 'main.ts'),
                'export-worker': resolve(electronDirectory, 'export-worker.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
        },
        rollupOptions: {
            external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
        },
        target: 'node22',
        sourcemap: true,
    },
});
