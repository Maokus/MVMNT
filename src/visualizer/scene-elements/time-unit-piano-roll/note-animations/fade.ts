import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base';

export class FadeAnimation extends BaseNoteAnimation {
  render(ctx: AnimationContext): RenderObjectInterface[] {
    const { x, y, width, height, color, progress, phase } = ctx;
    let alpha = 0.8;
    switch (phase) {
      case 'preOnset':
        // Subtle preview before the note starts
        alpha = 0.8 * Math.max(0, Math.min(1, progress));
        break;
      case 'onset':
        alpha = 0.8 + 0.2*(1-progress);
        break;
      case 'sustained':
        alpha = 0.8;
        break;
      case 'offset':
        alpha = 0.8 * (1 - this.easing.easeIn(Math.max(0, Math.min(1, progress))));
        break;
      case 'static':
      default:
        alpha = 0.8;
        break;
    }
    return [this.rect(x, y, width, height, color, alpha)];
  }
}
