export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
export const invLerp = (a: number, b: number, value: number): number => a === b ? 0 : (value - a) / (b - a);
export const remap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number =>
  lerp(outMin, outMax, invLerp(inMin, inMax, value));

export type EasingFn = (value: number) => number;
export const easings = Object.freeze({
  linear: (value: number) => value,
  easeInQuad: (value: number) => value * value,
  easeOutQuad: (value: number) => 1 - (1 - value) * (1 - value),
});
