import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base';

export class SlideAnimation extends BaseNoteAnimation {
  render(ctx: AnimationContext): RenderObjectInterface[] {
    const { x, y, width, height, color, progress, phase } = ctx;
    const p = Math.max(0, Math.min(1, progress));

    let alpha = 0.8;
    let dx = 0;
    switch (phase) {
      case 'preOnset':
        dx = width * (1 - this.easing.easeOut(p));
        alpha = 0.4 + 0.4 * p;
        return [this.rect(x - dx, y, width, height, color, alpha)];
      case 'onset':
        dx = width * (1 - this.easing.easeInOutQuad(p));
        alpha = 0.4 + 0.4 * p;
        return [this.rect(x - dx, y, width, height, color, alpha)];
      case 'sustained':
        return [this.rect(x, y, width, height, color, 0.8)];
      case 'offset':
        dx = width * this.easing.easeIn(p);
        alpha = 0.8 * (1 - p);
        return [this.rect(x + dx, y, width, height, color, alpha)];
      default:
        return [this.rect(x, y, width, height, color, 0.8)];
    }
  }
}
