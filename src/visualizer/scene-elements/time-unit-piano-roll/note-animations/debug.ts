import { Text } from '../../../render-objects/text.js';
import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base';

export class DebugAnimation extends BaseNoteAnimation {
  render(ctx: AnimationContext): RenderObjectInterface[] {
    const { x, y, width, height, color, progress, phase } = ctx;
    const info = `${(progress*100).toFixed(0)}% x:${x.toFixed(0)} y:${y.toFixed(0)} w:${width.toFixed(0)} h:${height.toFixed(0)}`;

    switch (phase) {
      case 'preOnset': {
        return [new Text(x,y,`preOnset ${info}`)];
      }
      case 'onset': {
        return [new Text(x,y,`onset ${info}`)]
      }
      case 'sustained':
        return [new Text(x,y,`sustained ${info}`)]
      case 'offset': {
        return [new Text(x,y,`offset ${info}`)]
      }
      default:
        return [this.rect(x, y, width, height, color, 0.8)];
    }
  }
}
