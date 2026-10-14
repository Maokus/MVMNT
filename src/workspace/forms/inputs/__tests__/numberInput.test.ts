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
    });

    it('rejects non-allowlisted or non-finite results', () => {
        expect(parseNumberInputWithExpression('')).toBeNull();
        expect(parseNumberInputWithExpression('abc')).toBeNull();
        expect(parseNumberInputWithExpression('Math.max(1,2)')).toBeNull();
        expect(parseNumberInputWithExpression('1/0')).toBeNull();
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
