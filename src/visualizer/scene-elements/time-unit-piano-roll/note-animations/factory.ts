import type { AnimationType } from '../animation-controller';
import { BaseNoteAnimation } from './base';
import { FadeAnimation } from './fade';
import { SlideAnimation } from './slide';
import { DebugAnimation } from './debug';
import { ScaleAnimation } from './scale';
import { ExpandAnimation } from './expand';
import { ExplodeAnimation } from './explode';

export function createAnimationInstance(type: AnimationType): BaseNoteAnimation {
    switch (type) {
        case 'fade': {
            return new FadeAnimation();
        }
        case 'slide': {
            return new SlideAnimation();
        }
        case 'scale': {
            return new ScaleAnimation();
        }
        case 'debug': {
            return new DebugAnimation();
        }
        case 'explode': {
            return new ExplodeAnimation();
        }
        case 'expand':
        default: {
            return new ExpandAnimation();
        }
    }
}
