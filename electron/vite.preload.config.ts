import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { buildMetadataDefines } from '../scripts/build-metadata.mjs';

const electronDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    define: buildMetadataDefines(),
    publicDir: false,
    build: {
        outDir: 'dist/electron',
        emptyOutDir: false,
        lib: {
            entry: resolve(electronDirectory, 'preload.ts'),
            formats: ['cjs'],
            fileName: () => 'preload.cjs',
        },
        rollupOptions: {
            external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
        },
        target: 'node22',
        sourcemap: true,
    },
});
