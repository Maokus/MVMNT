import type { RenderObjectInterface } from '../../../types.js';
import easingsFunctions from '../../../utils/easings';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '../../../utils/animations';
import { Rectangle } from '../../../render-objects/rectangle.js';

const ef = easingsFunctions;

export class ScaleAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        const p = Math.max(0, Math.min(1, progress));

        let rect = new Rectangle(x, y, width, height, color);
        switch (phase) {
            case 'attack':
                // Slightly smaller preview scaling up to 90%
                rect.scaleX = rect.scaleY = af.lerp(0, 1, ef.easeOutQuad(progress));
                rect.opacity = af.lerp(0, 0.9, progress);
                break;
            case 'decay':
                rect.shadowBlur = af.lerp(100, 0, ef.easeInOutQuad(progress));
                rect.shadowColor = color;
                break;
            case 'sustain':
                break;
            case 'release':
                rect.scaleX = rect.scaleY = af.lerp(1, 0, ef.easeInExpo(p));
                rect.opacity = af.lerp(0.8, 0, p);
                break;
            default:
                rect.scaleX = rect.scaleY = 1;
                rect.opacity = 0.8;
                break;
        }

        const w = Math.max(1, width * rect.scaleX);
        const h = Math.max(1, height * rect.scaleY);
        const ox = (width - w) / 2;
        const oy = (height - h) / 2;

        return [this.rect(x + ox, y + oy, w, h, color, rect.opacity)];
    }
}

registerAnimation({ name: 'scale', label: 'Scale', class: ScaleAnimation });
