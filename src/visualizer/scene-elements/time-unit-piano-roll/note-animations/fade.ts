import type { RenderObjectInterface } from '../../../types.js';
import easingsFunctions from '../../../utils/easings';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';

export class FadeAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        let alpha = 0.8;
        switch (phase) {
            case 'attack':
                // Subtle preview before the note starts
                alpha = 0.8 * Math.max(0, Math.min(1, progress));
                break;
            case 'decay':
                alpha = 0.8 + 0.2 * (1 - progress);
                break;
            case 'sustain':
                alpha = 0.8;
                break;
            case 'release':
                alpha = 0.8 * (1 - easingsFunctions.easeInQuad(Math.max(0, Math.min(1, progress))));
                break;
            case 'static':
            default:
                alpha = 0.8;
                break;
        }
        return [this.rect(x, y, width, height, color, alpha)];
    }
}

registerAnimation({ name: 'fade', label: 'Fade In/Out', class: FadeAnimation });
