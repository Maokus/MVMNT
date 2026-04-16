/**
 * Animation math: easing functions, interpolation helpers, and FloatCurve.
 *
 * @module @mvmnt/plugin-sdk/animation
 */

// Core math helpers
export {
    clamp,
    lerp,
    invLerp,
    remap,
    FloatCurve,
    AnimMath,
    type EasingFn,
    type FloatCurvePoint,
} from '@math/animation/anim-math';

// Named easing functions (all from easings.net)
// Each takes t ∈ [0,1] and returns a value ∈ [0,1]
export { default as easings } from '@math/animation/easing';
