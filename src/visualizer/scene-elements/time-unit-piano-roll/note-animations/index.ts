export { BaseNoteAnimation, type AnimationContext, type AnimationPhase } from './base';
export {
    registerAnimation,
    createAnimationInstance,
    getAvailableAnimations,
    getAnimationSelectOptions,
    type AnimationDefinition,
} from './registry';

// Auto-import all animation modules (side-effect: each registers itself)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __animationModules = import.meta.glob('./*.ts', { eager: true });
