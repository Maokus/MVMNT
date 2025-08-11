import type { AnimationType } from '../animation-controller';
import { BaseNoteAnimation } from './base';

export function createAnimationInstance(type: AnimationType): BaseNoteAnimation {
  switch (type) {
    case 'fade': {
      const { FadeAnimation } = require('./fade');
      return new FadeAnimation();
    }
    case 'slide': {
      const { SlideAnimation } = require('./slide');
      return new SlideAnimation();
    }
    case 'scale': {
      const { ScaleAnimation } = require('./scale');
      return new ScaleAnimation();
    }
    case 'debug': {
      const {DebugAnimation} = require('./debug');
      return new DebugAnimation();
    }
    case 'expand':
    default: {
      const { ExpandAnimation } = require('./expand');
      return new ExpandAnimation();
    }
  }
}
