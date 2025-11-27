import easingFunctions from '@animation/easing';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '@animation/anim-math';
import { Rectangle, RenderObject } from '@core/render/render-objects';

const ef = easingFunctions;

export class ScaleAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        const p = Math.max(0, Math.min(1, progress));

        let rect = new Rectangle(x, y, width, height, color);
        switch (phase) {
            case 'attack':
                // Slightly smaller preview scaling up to 90%
                rect.scaleX = rect.scaleY = af.lerp(0, 1, ef.easeOutQuad(progress));
                rect.opacity = af.lerp(0, 1, ef.easeOutQuad(progress));
                break;
            case 'decay':
                rect.shadowBlur = af.lerp(100, 0, ef.easeInOutQuad(progress));
                rect.shadowColor = color;
                break;
            case 'sustain':
                rect.opacity = 1;
                break;
            case 'release':
                rect.scaleX = rect.scaleY = af.lerp(1, 0, ef.easeInExpo(p));
                rect.opacity = af.lerp(1, 0, p);
                break;
            default:
                rect.scaleX = rect.scaleY = 1;
                rect.opacity = 1;
                break;
        }

        const w = Math.max(1, width * rect.scaleX);
        const h = Math.max(1, height * rect.scaleY);
        const ox = (width - w) / 2;
        const oy = (height - h) / 2;
        let rect2 = new Rectangle(x + ox, y + oy, w, h, color);
        rect2.opacity = rect.opacity;
        return this.markNonLayout([rect2]);
    }
}

registerAnimation({ name: 'scale', label: 'Scale', class: ScaleAnimation });
