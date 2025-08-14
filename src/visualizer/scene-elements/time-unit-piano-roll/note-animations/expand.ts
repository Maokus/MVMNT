import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base';
import easingsFunctions from '../../../utils/easings';

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
                return [this.rect(x, y, w, height, color, 0.8)];
            }
            case 'sustain': {
                return [this.rect(x, y, width, height, color, 0.8)];
            }
            case 'release': {
                const w = Math.max(1, width * (1 - easingsFunctions.easeOutExpo(p)));
                return [this.rect(x + width - w, y, w, height, color, 0.8)];
            }
            default:
                return [this.rect(x, y, width, height, color, 0.8)];
        }
    }
}
