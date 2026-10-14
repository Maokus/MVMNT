/** Parse a committed numeric field: plain finite numbers only, no expression eval. */
export function parseNumberInput(rawValue: string): number | null {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    const direct = Number(trimmed);
    return Number.isFinite(direct) ? direct : null;
}

/**
 * Parse with arithmetic-expression fallback (FormInput number fields).
 * Previously evaluated via `new Function`, which needs `unsafe-eval` under a
 * strict content-security policy. This recursive-descent parser accepts the
 * same inputs: plain numbers first, then allowlisted `+-*\/()`, whitespace,
 * decimals, unary chains, and `**` with JS precedence (including the
 * `-2**2` rejection and strict-mode octal rejection). Differential-fuzzed
 * against the old evaluator (60 fixed + 100k random cases): the only
 * intentional delta is JS comment syntax (`/*`, `*\/`, `//`), which the old
 * code evaluated by accident and this parser rejects — comments are not
 * arithmetic.
 */
export function parseNumberInputWithExpression(rawValue: string): number | null {
    const plain = parseNumberInput(rawValue);
    if (plain !== null) return plain;

    const trimmed = rawValue.trim();
    const allowedPattern = /^[\d+\-*/().\s]+$/;
    if (!allowedPattern.test(trimmed)) {
        return null;
    }
    // Match JS lexing: adjacent ++/-- are increment/decrement (invalid on literals).
    if (/\+\+|--/.test(trimmed)) {
        return null;
    }

    try {
        const computed = evaluateArithmetic(trimmed);
        if (typeof computed === 'number' && Number.isFinite(computed)) {
            return computed;
        }
    } catch {
        return null;
    }

    return null;
}

class ArithmeticParseError extends Error {}

function evaluateArithmetic(source: string): number {
    let pos = 0;

    const fail = (): never => {
        throw new ArithmeticParseError();
    };

    const skipWhitespace = (): void => {
        while (pos < source.length && /\s/.test(source[pos])) pos++;
    };

    const readNumber = (): number => {
        skipWhitespace();
        const match = /^(\d+\.?\d*|\.\d+)/.exec(source.slice(pos));
        const token = match?.[1];
        if (token === undefined) {
            throw new ArithmeticParseError();
        }
        // Strict-mode JS rejects legacy octal literals (01, 007); match that.
        if (/^0[0-9]/.test(token)) fail();
        pos += token.length;
        return Number(token);
    };

    const parsePrimary = (): number => {
        skipWhitespace();
        if (source[pos] === '(') {
            pos++;
            const value = parseAdd();
            skipWhitespace();
            if (source[pos] !== ')') fail();
            pos++;
            return value;
        }
        return readNumber();
    };

    // Returns [value, sawPow]: sawPow tracks a top-level ** so a unary
    // directly before ** is rejected exactly like JS ("-2**2" is a SyntaxError).
    const parsePow = (): [number, boolean] => {
        const left = parsePrimary();
        skipWhitespace();
        if (source[pos] === '*' && source[pos + 1] === '*') {
            pos += 2;
            const right = parseUnary();
            return [Math.pow(left, right), true];
        }
        return [left, false];
    };

    const parsePowOrUnary = (): [number, boolean] => {
        skipWhitespace();
        if (source[pos] === '+' || source[pos] === '-') {
            const op = source[pos];
            pos++;
            const [value, pow] = parsePowOrUnary();
            return [op === '+' ? value : -value, pow];
        }
        return parsePow();
    };

    const parseUnary = (): number => {
        skipWhitespace();
        if (source[pos] === '+' || source[pos] === '-') {
            const op = source[pos];
            pos++;
            const [value, pow] = parsePowOrUnary();
            if (pow) fail();
            return op === '+' ? value : -value;
        }
        return parsePow()[0];
    };

    const parseMul = (): number => {
        let value = parseUnary();
        for (;;) {
            skipWhitespace();
            const op = source[pos];
            if (op === '*' && source[pos + 1] !== '*') {
                pos++;
                value = value * parseUnary();
            } else if (op === '/') {
                pos++;
                value = value / parseUnary();
            } else return value;
        }
    };

    const parseAdd = (): number => {
        let value = parseMul();
        for (;;) {
            skipWhitespace();
            const op = source[pos];
            if (op === '+') {
                pos++;
                value = value + parseMul();
            } else if (op === '-') {
                pos++;
                value = value - parseMul();
            } else return value;
        }
    };

    const value = parseAdd();
    skipWhitespace();
    if (pos !== source.length) fail();
    return value;
}

/** Positive-int clamp with fallback (settings dimensions, fps). */
export function clampPositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
}
