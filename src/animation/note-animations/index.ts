export { BaseNoteAnimation, type AnimationContext, type AnimationPhase } from './base';
export {
    registerAnimation,
    createAnimationInstance,
    getAvailableAnimations,
    getAnimationSelectOptions,
    type AnimationDefinition,
} from './registry';

// Auto-import all animation modules (side-effect: each registers itself)
// Exclude the scaffolding template from bundling
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __animationModules = import.meta.glob(['./*.ts', '!./template.ts'], { eager: true });
