export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
export const invLerp = (a: number, b: number, value: number): number => (a === b ? 0 : (value - a) / (b - a));
export const remap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number =>
    lerp(outMin, outMax, invLerp(inMin, inMax, value));

export type EasingFn = (value: number) => number;
export const easings = Object.freeze({
    linear: (value: number) => value,
    easeInQuad: (value: number) => value * value,
    easeOutQuad: (value: number) => 1 - (1 - value) * (1 - value),
    easeInCubic: (value: number) => value * value * value,
    easeOutCubic: (value: number) => 1 - Math.pow(1 - value, 3),
    easeOutExpo: (value: number) => (value === 1 ? 1 : 1 - Math.pow(2, -10 * value)),
    easeOutBack: (value: number) => 1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2),
});

export interface FloatCurvePoint {
    factor: number;
    value: number;
    easeToNext: EasingFn;
}
export class FloatCurve {
    private readonly points: FloatCurvePoint[];
    constructor(raw: Array<[number, number, EasingFn?]>) {
        this.points = raw
            .map(([factor, value, easeToNext]) => ({
                factor: clamp(factor, 0, 1),
                value,
                easeToNext: easeToNext ?? easings.linear,
            }))
            .sort((a, b) => a.factor - b.factor);
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
