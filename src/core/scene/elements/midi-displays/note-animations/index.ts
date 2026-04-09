export { BaseNoteAnimation, type AnimationContext, type AnimationPhase } from './base';
export {
    registerAnimation,
    createAnimationInstance,
    getAvailableAnimations,
    getAnimationSelectOptions,
    type AnimationDefinition,
} from './registry';

// Auto-import all animation modules. Each file calls registerAnimation() as a side effect.
// The variable is intentionally unused — its only purpose is to hold the glob so the
// import actually happens (a bare expression isn't valid here).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __animationModules = import.meta.glob(['./*.ts', '!./template.ts'], { eager: true });
