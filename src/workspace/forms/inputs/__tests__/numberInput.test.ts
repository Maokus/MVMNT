import { describe, expect, it } from 'vitest';
import { clampPositiveInt, parseNumberInput, parseNumberInputWithExpression } from '../numberInput';

describe('parseNumberInput', () => {
    it('parses plain finite numbers', () => {
        expect(parseNumberInput('42')).toBe(42);
        expect(parseNumberInput(' 3.5 ')).toBe(3.5);
        expect(parseNumberInput('-7')).toBe(-7);
    });

    it('rejects empty, non-numeric, and non-finite input', () => {
        expect(parseNumberInput('')).toBeNull();
        expect(parseNumberInput('   ')).toBeNull();
        expect(parseNumberInput('abc')).toBeNull();
        expect(parseNumberInput('Infinity')).toBeNull();
        expect(parseNumberInput('1+2')).toBeNull();
    });
});

describe('parseNumberInputWithExpression', () => {
    it('accepts plain numbers first', () => {
        expect(parseNumberInputWithExpression('42')).toBe(42);
    });

    it('evaluates allowlisted arithmetic', () => {
        expect(parseNumberInputWithExpression('1+2*3')).toBe(7);
        expect(parseNumberInputWithExpression('(10 - 4) / 2')).toBe(3);
        expect(parseNumberInputWithExpression('2**3')).toBe(8);
        expect(parseNumberInputWithExpression('2**3**2')).toBe(512);
        expect(parseNumberInputWithExpression('-(3+4)*2')).toBe(-14);
        expect(parseNumberInputWithExpression('.5')).toBe(0.5);
    });

    it('rejects non-allowlisted or non-finite results', () => {
        expect(parseNumberInputWithExpression('')).toBeNull();
        expect(parseNumberInputWithExpression('abc')).toBeNull();
        expect(parseNumberInputWithExpression('Math.max(1,2)')).toBeNull();
        expect(parseNumberInputWithExpression('1/0')).toBeNull();
    });

    it('matches JS rejections for unary-before-** and legacy octals', () => {
        expect(parseNumberInputWithExpression('-2**2')).toBeNull();
        expect(parseNumberInputWithExpression('2++2')).toBeNull();
        // Bare '01' takes the plain-number fast path in old and new code alike;
        // legacy octals are rejected once embedded in an expression.
        expect(parseNumberInputWithExpression('01')).toBe(1);
        expect(parseNumberInputWithExpression('3+01')).toBeNull();
        expect(parseNumberInputWithExpression('2**-3')).toBeCloseTo(0.125);
    });

    it('rejects JS comment syntax instead of evaluating it', () => {
        expect(parseNumberInputWithExpression('10.5-0.5/**/')).toBeNull();
        expect(parseNumberInputWithExpression('2/**/ + 3')).toBeNull();
    });
});

describe('clampPositiveInt', () => {
    it('floors positive finite values', () => {
        expect(clampPositiveInt(60.9, 30)).toBe(60);
    });

    it('falls back for zero, negative, and non-finite values', () => {
        expect(clampPositiveInt(0, 30)).toBe(30);
        expect(clampPositiveInt(-5, 30)).toBe(30);
        expect(clampPositiveInt(NaN, 30)).toBe(30);
        expect(clampPositiveInt(Infinity, 30)).toBe(30);
    });
});
