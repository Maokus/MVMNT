import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import easingsFunctions from '../../../utils/easings';
import { Rectangle } from '../../../render-objects';

export class ExpandAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;
        const p = Math.max(0, Math.min(1, progress));

        switch (phase) {
            case 'attack': {
                return [];
            }
            case 'decay': {
                const w = Math.max(1, width * easingsFunctions.easeOutQuint(p));
                return [new Rectangle(x, y, w, height, color)];
            }
            case 'sustain': {
                return [new Rectangle(x, y, width, height, color)];
            }
            case 'release': {
                const w = Math.max(1, width * (1 - easingsFunctions.easeOutExpo(p)));
                return [new Rectangle(x + width - w, y, w, height, color)];
            }
            default:
                return [new Rectangle(x, y, width, height, color)];
        }
    }
}

registerAnimation({ name: 'expand', label: 'Expand', class: ExpandAnimation });
