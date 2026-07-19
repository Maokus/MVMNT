/**
 * App compatibility barrel. Public animation behavior is owned by the plugin SDK
 * so built-ins and third-party plugins execute the same implementation.
 */
export {
    clamp,
    lerp,
    invLerp,
    remap,
    FloatCurve,
    type EasingFn,
    type FloatCurvePoint,
} from '../../../packages/plugin-sdk/src/animation';

import { clamp, lerp, invLerp, remap } from '../../../packages/plugin-sdk/src/animation';

export const AnimMath = Object.freeze({ clamp, lerp, invLerp, remap });
export default AnimMath;
