import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { buildMetadataDefines } from '../scripts/build-metadata.mjs';

const electronDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        define: {
            ...buildMetadataDefines(),
            __POSTHOG_CSP_SCRIPT_SRC__: JSON.stringify(env.POSTHOG_CSP_SCRIPT_SRC),
            __POSTHOG_CSP_CONNECT_SRC__: JSON.stringify(env.VITE_PUBLIC_POSTHOG_HOST),
        },
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
    };
});
