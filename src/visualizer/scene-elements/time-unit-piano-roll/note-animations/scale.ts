import type { RenderObjectInterface } from '../../../types.js';
import easingsFunctions from '../../../utils/easings';
import { BaseNoteAnimation, type AnimationContext } from './base';

export class ScaleAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        const p = Math.max(0, Math.min(1, progress));

        let sx = 1,
            sy = 1,
            alpha = 0.8,
            ox = 0,
            oy = 0;
        switch (phase) {
            case 'attack':
                // Slightly smaller preview scaling up to 90%
                sx = sy = 0.7 + 0.2 * easingsFunctions.easeOutExpo(p);
                alpha = 0.5 + 0.3 * p;
                break;
            case 'decay':
                sx = sy = easingsFunctions.easeInOutQuad(p);
                alpha = 0.8;
                break;
            case 'sustain':
                sx = sy = 1;
                alpha = 0.8;
                break;
            case 'release':
                sx = sy = 1 - easingsFunctions.easeInExpo(p);
                alpha = 0.6 + 0.2 * (1 - p);
                break;
            default:
                sx = sy = 1;
                alpha = 0.8;
                break;
        }

        const w = Math.max(1, width * sx);
        const h = Math.max(1, height * sy);
        ox = (width - w) / 2;
        oy = (height - h) / 2;

        return [this.rect(x + ox, y + oy, w, h, color, alpha)];
    }
}
