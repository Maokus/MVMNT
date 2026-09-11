import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { renderElementTemplate } from '../../../../../packages/create-mvmnt-plugin/bin/create-mvmnt-plugin.mjs';
import { SimulationRunner, type SimulationInputs } from '../simulation-runner';
import { ok } from '../../../../../packages/plugin-sdk/src/api';

function loadRenderedTemplate() {
    const templatePath = resolve('packages/create-mvmnt-plugin/templates/midi-spring/src/element.ts');
    const source = renderElementTemplate(readFileSync(templatePath, 'utf8'), {
        ELEMENT_TYPE: 'midi-spring',
        ELEMENT_NAME: 'MIDI Spring',
        ELEMENT_DESCRIPTION: 'Deterministic fixed-step MIDI spring',
    });
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const callable = new Proxy(() => ({}), { get: () => callable });
    const module = { exports: {} as Record<string, any> };
    const load = (specifier: string) =>
        specifier.endsWith('/render')
            ? { Rectangle: class {} }
            : {
                  definePluginElement: (definition: unknown) => definition,
                  group: callable,
                  prop: callable,
                  tab: callable,
              };
    Function('module', 'exports', 'require', code)(module, module.exports, load);
    return module.exports.midiSpring;
}

const midiSpring = loadRenderedTemplate();

describe('MIDI spring export stability', () => {
    it.each([
        [30, 2],
        [100_000, 2],
        [30, 1000],
    ])('prepares a long exact replay with stiffness %s and damping %s', async (stiffness, damping) => {
        const inputs: SimulationInputs = {
            identity: {},
            propsAt: () => ({ seed: 1, midiTrackId: 'notes', stiffness, damping, strength: 800 }),
            contextAt: (step) => ({ noteOns: () => ok(step % 120 === 0 ? [{}] : []) }) as any,
            checkReads() {},
        };
        const runner = new SimulationRunner(midiSpring.simulation!, () => {});
        try {
            await runner.prepare(30, inputs);
            const state = runner.snapshot(30)!.state;
            expect(Number.isFinite(state.position)).toBe(true);
            expect(Number.isFinite(state.velocity)).toBe(true);
            expect(Math.abs(state.position)).toBeLessThan(1000);
            await runner.prepare(0, inputs);
            await runner.prepare(30, inputs);
            expect(runner.snapshot(30)!.state).toEqual(state);
        } finally {
            runner.dispose();
        }
    });
});
