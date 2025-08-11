import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base';

export class ExpandAnimation extends BaseNoteAnimation {
  render(ctx: AnimationContext): RenderObjectInterface[] {
    const { x, y, width, height, color, progress, phase } = ctx;
    const p = Math.max(0, Math.min(1, progress));

    switch (phase) {
      case 'preOnset': {
        const w = Math.max(1, width * (0.2 + 0.6 * this.easing.easeOut(p)));
        return [this.rect(x, y, w, height, color, 0.6)];
      }
      case 'onset': {
        const w = Math.max(1, width * this.easing.easeInOutQuad(p));
        return [this.rect(x, y, w, height, color, 0.8)];
      }
      case 'sustained':
        return [this.rect(x, y, width, height, color, 0.8)];
      case 'offset': {
        const w = Math.max(1, width * (1 - this.easing.easeIn(p)));
        return [this.rect(x, y, w, height, color, 0.8)];
      }
      default:
        return [this.rect(x, y, width, height, color, 0.8)];
    }
  }
}
