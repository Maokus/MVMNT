export const clamp = (value: number, min: number, max: number): number =>
    value < min ? min : value > max ? max : value;
export const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
export const invLerp = (a: number, b: number, value: number): number => (a === b ? 0 : (value - a) / (b - a));
/** Map a value between ranges, clamping it to the input range first. */
export const remap = (inMin: number, inMax: number, outMin: number, outMax: number, value: number): number =>
    lerp(outMin, outMax, clamp(invLerp(inMin, inMax, value), 0, 1));

export type EasingFn = (value: number) => number;
const pow = Math.pow;
const sqrt = Math.sqrt;
const sin = Math.sin;
const cos = Math.cos;
const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;
const bounceOut: EasingFn = (value) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (value < 1 / d1) return n1 * value * value;
    if (value < 2 / d1) return n1 * (value -= 1.5 / d1) * value + 0.75;
    if (value < 2.5 / d1) return n1 * (value -= 2.25 / d1) * value + 0.9375;
    return n1 * (value -= 2.625 / d1) * value + 0.984375;
};

/** Canonical easing dictionary shared by the app and third-party plugins. */
export const easings: Readonly<Record<string, EasingFn>> = Object.freeze({
    linear: (value: number) => value,
    hold: (value: number) => (value >= 1 ? 1 : 0),
    easeInQuad: (value: number) => value * value,
    easeOutQuad: (value: number) => 1 - (1 - value) * (1 - value),
    easeInOutQuad: (value: number) => (value < 0.5 ? 2 * value * value : 1 - pow(-2 * value + 2, 2) / 2),
    easeInCubic: (value: number) => value * value * value,
    easeOutCubic: (value: number) => 1 - Math.pow(1 - value, 3),
    easeInOutCubic: (value: number) => (value < 0.5 ? 4 * value ** 3 : 1 - pow(-2 * value + 2, 3) / 2),
    easeInQuart: (value: number) => value ** 4,
    easeOutQuart: (value: number) => 1 - (1 - value) ** 4,
    easeInOutQuart: (value: number) => (value < 0.5 ? 8 * value ** 4 : 1 - pow(-2 * value + 2, 4) / 2),
    easeInQuint: (value: number) => value ** 5,
    easeOutQuint: (value: number) => 1 - (1 - value) ** 5,
    easeInOutQuint: (value: number) => (value < 0.5 ? 16 * value ** 5 : 1 - pow(-2 * value + 2, 5) / 2),
    easeInSine: (value: number) => 1 - cos((value * PI) / 2),
    easeOutSine: (value: number) => sin((value * PI) / 2),
    easeInOutSine: (value: number) => -(cos(PI * value) - 1) / 2,
    easeInExpo: (value: number) => (value === 0 ? 0 : pow(2, 10 * value - 10)),
    easeOutExpo: (value: number) => (value === 1 ? 1 : 1 - Math.pow(2, -10 * value)),
    easeInOutExpo: (value: number) =>
        value === 0
            ? 0
            : value === 1
              ? 1
              : value < 0.5
                ? pow(2, 20 * value - 10) / 2
                : (2 - pow(2, -20 * value + 10)) / 2,
    easeInCirc: (value: number) => 1 - sqrt(1 - value ** 2),
    easeOutCirc: (value: number) => sqrt(1 - (value - 1) ** 2),
    easeInOutCirc: (value: number) =>
        value < 0.5 ? (1 - sqrt(1 - (2 * value) ** 2)) / 2 : (sqrt(1 - (-2 * value + 2) ** 2) + 1) / 2,
    easeInBack: (value: number) => c3 * value ** 3 - c1 * value ** 2,
    easeOutBack: (value: number) => 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2,
    easeInOutBack: (value: number) =>
        value < 0.5
            ? ((2 * value) ** 2 * ((c2 + 1) * 2 * value - c2)) / 2
            : ((2 * value - 2) ** 2 * ((c2 + 1) * (value * 2 - 2) + c2) + 2) / 2,
    easeInElastic: (value: number) =>
        value === 0 ? 0 : value === 1 ? 1 : -pow(2, 10 * value - 10) * sin((value * 10 - 10.75) * c4),
    easeOutElastic: (value: number) =>
        value === 0 ? 0 : value === 1 ? 1 : pow(2, -10 * value) * sin((value * 10 - 0.75) * c4) + 1,
    easeInOutElastic: (value: number) =>
        value === 0
            ? 0
            : value === 1
              ? 1
              : value < 0.5
                ? -(pow(2, 20 * value - 10) * sin((20 * value - 11.125) * c5)) / 2
                : (pow(2, -20 * value + 10) * sin((20 * value - 11.125) * c5)) / 2 + 1,
    easeInBounce: (value: number) => 1 - bounceOut(1 - value),
    easeOutBounce: bounceOut,
    easeInOutBounce: (value: number) =>
        value < 0.5 ? (1 - bounceOut(1 - 2 * value)) / 2 : (1 + bounceOut(2 * value - 1)) / 2,
});

export interface FloatCurvePoint {
    factor: number;
    value: number;
    easeToNext: EasingFn;
}
export class FloatCurve {
    private readonly points: FloatCurvePoint[];
    constructor(raw: Array<[number, number, EasingFn?]>) {
        if (!raw.length) {
            this.points = [
                { factor: 0, value: 0, easeToNext: easings.linear },
                { factor: 1, value: 1, easeToNext: easings.linear },
            ];
            return;
        }
        const sorted = raw
            .map(([factor, value, easeToNext]) => ({
                factor: clamp(factor, 0, 1),
                value,
                easeToNext: easeToNext ?? easings.linear,
            }))
            .sort((a, b) => a.factor - b.factor);
        if (sorted[0].factor > 0) sorted.unshift({ factor: 0, value: 0, easeToNext: easings.linear });
        const last = sorted[sorted.length - 1];
        if (last.factor < 1) sorted.push({ factor: 1, value: last.value, easeToNext: easings.linear });
        const deduplicated: FloatCurvePoint[] = [];
        for (const point of sorted) {
            const previous = deduplicated[deduplicated.length - 1];
            if (previous && Math.abs(previous.factor - point.factor) < 1e-6) {
                previous.value = point.value;
                previous.easeToNext = point.easeToNext;
            } else {
                deduplicated.push(point);
            }
        }
        this.points = deduplicated;
    }
    valAt(value: number): number {
        if (!this.points.length) return 0;
        const factor = clamp(value, 0, 1);
        for (let index = 0; index < this.points.length - 1; index++) {
            const from = this.points[index],
                to = this.points[index + 1];
            if (factor <= to.factor)
                return lerp(from.value, to.value, from.easeToNext(invLerp(from.factor, to.factor, factor)));
        }
        return this.points[this.points.length - 1].value;
    }
    getPoints(): FloatCurvePoint[] {
        return this.points.map((point) => ({ ...point }));
    }
}
