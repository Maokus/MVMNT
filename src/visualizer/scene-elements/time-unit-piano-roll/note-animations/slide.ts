import type { RenderObjectInterface } from '../../../types.js';
import easingsFunctions from '../../../utils/easings';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';

export class SlideAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        const p = Math.max(0, Math.min(1, progress));

        let alpha = 0.8;
        let dx = 0;
        switch (phase) {
            case 'attack':
                dx = width * (1 - easingsFunctions.easeOutExpo(p));
                alpha = 0.4 + 0.4 * p;
                return [this.rect(x - dx, y, width, height, color, alpha)];
            case 'decay':
                dx = width * (1 - easingsFunctions.easeInOutQuad(p));
                alpha = 0.4 + 0.4 * p;
                return [this.rect(x - dx, y, width, height, color, alpha)];
            case 'sustain':
                return [this.rect(x, y, width, height, color, 0.8)];
            case 'release':
                dx = width * easingsFunctions.easeInExpo(p);
                alpha = 0.8 * (1 - p);
                return [this.rect(x + dx, y, width, height, color, alpha)];
            default:
                return [this.rect(x, y, width, height, color, 0.8)];
        }
    }
}

registerAnimation({ name: 'slide', label: 'Slide', class: SlideAnimation });
