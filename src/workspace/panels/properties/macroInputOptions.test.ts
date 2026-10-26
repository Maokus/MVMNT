import { describe, expect, it } from 'vitest';
import { elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import { effectiveMacroInputOptions } from './macroInputOptions';

const elements = { first: { type: 'textOverlay' }, second: { type: 'textOverlay' } };

describe('macro input options', () => {
    it('inherits numeric settings across assignments to one property kind', () => {
        expect(
            effectiveMacroInputOptions(
                { type: 'number', options: {} },
                [elementPropertyTarget('first', 'opacity'), elementPropertyTarget('second', 'opacity')],
                elements
            )
        ).toMatchObject({ min: 0, max: 1, step: 0.01 });
    });

    it('keeps explicit settings and falls back to them for mixed or empty assignments', () => {
        const macro = { type: 'number' as const, options: { min: 0.2, step: 0.05 } };
        expect(effectiveMacroInputOptions(macro, [elementPropertyTarget('first', 'opacity')], elements)).toMatchObject({
            min: 0.2,
            max: 1,
            step: 0.05,
        });
        expect(
            effectiveMacroInputOptions(
                macro,
                [elementPropertyTarget('first', 'opacity'), elementPropertyTarget('second', 'fontSize')],
                elements
            )
        ).toEqual(macro.options);
        expect(effectiveMacroInputOptions(macro, [], elements)).toEqual(macro.options);
        expect(
            effectiveMacroInputOptions(
                macro,
                [elementPropertyTarget('first', 'opacity'), elementPropertyTarget('third', 'opacity')],
                { ...elements, third: { type: 'background' } }
            )
        ).toEqual(macro.options);
    });

    it('inherits choices and host-node numeric settings', () => {
        const choiceOptions = effectiveMacroInputOptions(
            { type: 'select', options: {} },
            [elementPropertyTarget('first', 'blendMode'), elementPropertyTarget('second', 'blendMode')],
            elements
        );
        expect(choiceOptions.selectOptions).toContainEqual({ value: 'source-over', label: 'Normal' });
        expect(
            effectiveMacroInputOptions(
                { type: 'number', options: {} },
                [nodePropertyTarget('one', 'localOpacity'), nodePropertyTarget('two', 'localOpacity')],
                elements
            )
        ).toMatchObject({ min: 0, max: 1, step: 0.01 });
        expect(
            effectiveMacroInputOptions(
                { type: 'number', options: {} },
                [nodePropertyTarget('one', 'rotation')],
                elements
            ).step
        ).toBeCloseTo(Math.PI / 180);
    });
});
