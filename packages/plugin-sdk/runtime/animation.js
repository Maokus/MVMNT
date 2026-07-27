export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, amount) => a + (b - a) * amount;
export const invLerp = (a, b, value) => (a === b ? 0 : (value - a) / (b - a));
export const remap = (value, inMin, inMax, outMin, outMax) => lerp(outMin, outMax, invLerp(inMin, inMax, value));
export const easings = Object.freeze({
    linear: (value) => value,
    easeInQuad: (value) => value * value,
    easeOutQuad: (value) => 1 - (1 - value) ** 2,
});
