import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import * as fflate from 'fflate';
import { buildPluginArchive } from './build.mjs';

const require = createRequire(import.meta.url);

function smokeLoadDefinition(code, element) {
    const expectedType = element.type;
    const callableStub = new Proxy(function () {}, {
        apply: () => callableStub,
        construct: () => callableStub,
        get: () => callableStub,
    });
    const renderModule = new Proxy({}, { get: () => callableStub });
    const sdkModule = {
        definePluginElement: (definition) => Object.freeze({ ...definition, kind: 'mvmnt.plugin-element.v2' }),
        group: (id, label, properties, options = {}) => ({ id, label, properties, collapsed: false, ...options }),
        prop: new Proxy(
            {},
            {
                get:
                    () =>
                    (key, label, value = null) => ({ key, label, default: value }),
            }
        ),
        tab: new Proxy({}, { get: () => (groups) => ({ id: 'test', label: 'Test', groups }) }),
    };
    const module = { exports: {} };
    const load = (specifier) => (specifier === '@mvmnt-app/plugin-sdk' ? sdkModule : renderModule);
    Function('module', 'exports', 'require', code)(module, module.exports, load);
    const definition =
        module.exports?.default ??
        (module.exports?.kind === 'mvmnt.plugin-element.v2'
            ? module.exports
            : Object.values(module.exports ?? {}).find((value) => value?.kind === 'mvmnt.plugin-element.v2'));
    if (definition?.kind !== 'mvmnt.plugin-element.v2' || definition.type !== expectedType)
        throw new Error(`${expectedType}: bundled entry did not export its SDK 2 definition`);
    if (typeof definition.render !== 'function') throw new Error(`${expectedType}: definition has no render callback`);
    if (definition.create || definition.dispose)
        throw new Error(`${expectedType}: use createResources/disposeResources and named render inputs`);
    if (!definition.createResources && !(element.capabilities?.required?.length > 0)) {
        const props = Object.fromEntries(
            (definition.schema?.tabs ?? []).flatMap((tab) =>
                (tab.groups ?? []).flatMap((group) =>
                    (group.properties ?? []).map((property) => [property.key, property.default ?? null])
                )
            )
        );
        const rendered = definition.render({
            props,
            resources: undefined,
            time: { seconds: 0, beats: 0, ticks: 0, frame: 0 },
            context: callableStub,
        });
        if (!Array.isArray(rendered)) throw new Error(`${expectedType}: render smoke test did not return an array`);
    }
}

export async function checkPlugin(pluginDirectory) {
    const directory = path.resolve(pluginDirectory);
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit'], {
        cwd: directory,
        stdio: 'inherit',
    });
    const result = await buildPluginArchive(directory, { minify: false });
    const files = fflate.unzipSync(result.bytes);
    for (const element of result.bundledManifest.elements) {
        const code = files[element.entry] ? new TextDecoder().decode(files[element.entry]) : '';
        if (!code) throw new Error(`${element.type}: bundled entry '${element.entry}' is missing`);
        if (!code.includes('@mvmnt-app/plugin-sdk'))
            throw new Error(`${element.type}: bundled entry does not load the host-injected SDK`);
        smokeLoadDefinition(code, element);
    }
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    if (manifest.id !== result.manifest.id) throw new Error('Packaged manifest identity changed during build');
    return { ...result, checkedEntries: manifest.elements.length };
}
