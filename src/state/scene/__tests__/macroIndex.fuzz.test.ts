import { describe, it, expect } from 'vitest';
import fixture from '@persistence/__fixtures__/phase0/scene.edge-macros.json';
import { createSceneStore } from '@state/sceneStore';

describe('sceneStore macro inverse index fuzz', () => {
    function createRng(seed: number) {
        let value = seed % 2147483647;
        if (value <= 0) value += 2147483646;
        return () => {
            value = (value * 16807) % 2147483647;
            return (value - 1) / 2147483646;
        };
    }

    it('keeps bindings.byMacro aligned with bindings.byElement after random edits', () => {
        const store = createSceneStore();
        store.getState().importScene(fixture as any);
        const rand = createRng(1337);

        const elementProps = () => {
            const state = store.getState();
            const order = state.order;
            if (order.length === 0) return null;
            const elementId = order[Math.floor(rand() * order.length)];
            const bindings = state.bindings.byElement[elementId];
            const keys = Object.keys(bindings);
            if (!keys.length) return null;
            const propertyPath = keys[Math.floor(rand() * keys.length)];
            return { elementId, propertyPath, binding: bindings[propertyPath] };
        };

        for (let i = 0; i < 200; i++) {
            const op = Math.floor(rand() * 4);
            const state = store.getState();
            if (op === 0) {
                const macroIds = state.macros.allIds;
                if (!macroIds.length) continue;
                const macroId = macroIds[Math.floor(rand() * macroIds.length)];
                const target = elementProps();
                if (!target) continue;
                store.getState().updateBindings(target.elementId, {
                    [target.propertyPath]: { type: 'macro', macroId },
                });
            } else if (op === 1) {
                const target = elementProps();
                if (!target || target.binding?.type !== 'macro') continue;
                store.getState().updateBindings(target.elementId, {
                    [target.propertyPath]: { type: 'constant', value: rand() },
                });
            } else if (op === 2) {
                const macroId = `macro.dynamic.${i}`;
                store.getState().createMacro(macroId, {
                    type: 'number',
                    value: Math.round(rand() * 100),
                    options: { min: 0, max: 200 },
                });
            } else {
                const macroIds = state.macros.allIds.filter((id) => !id.startsWith('macro.protected'));
                if (!macroIds.length) continue;
                const macroId = macroIds[Math.floor(rand() * macroIds.length)];
                if (state.bindings.byMacro[macroId]?.length && rand() < 0.3) {
                    // occasionally skip deleting macros with assignments to keep some bindings around
                    continue;
                }
                store.getState().deleteMacro(macroId);
            }

            const nextState = store.getState();
            const expected = new Map<string, Array<{ elementId: string; propertyPath: string }>>();
            for (const [elementId, bindings] of Object.entries(nextState.bindings.byElement)) {
                for (const [propertyPath, binding] of Object.entries(bindings)) {
                    if (binding.type !== 'macro') continue;
                    if (!expected.has(binding.macroId)) expected.set(binding.macroId, []);
                    expected.get(binding.macroId)!.push({ elementId, propertyPath });
                }
            }
            for (const entries of expected.values()) {
                entries.sort((a, b) =>
                    a.elementId === b.elementId
                        ? a.propertyPath.localeCompare(b.propertyPath)
                        : a.elementId.localeCompare(b.elementId)
                );
            }

            const actual = nextState.bindings.byMacro;
            const actualKeys = Object.keys(actual).sort();
            const expectedKeys = Array.from(expected.keys()).sort();
            expect(actualKeys).toEqual(expectedKeys);
            for (const key of expectedKeys) {
                const expectedAssignments = expected.get(key)!;
                const actualAssignments = (actual[key] ?? []).slice().sort((a, b) =>
                    a.elementId === b.elementId
                        ? a.propertyPath.localeCompare(b.propertyPath)
                        : a.elementId.localeCompare(b.elementId)
                );
                expect(actualAssignments).toEqual(expectedAssignments);
            }
        }
    });
});
