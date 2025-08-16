import { Rectangle, RenderObject } from '@core/render/render-objects';
import * as af from '@animation/anim-math.js';
import easingFunctions from '@animation/easing';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';

export class SlideAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        const p = Math.max(0, Math.min(1, progress));
        let alpha = 0.8;
        let dx = 0;
        let rectangle = new Rectangle(x, y, width, height, color);
        switch (phase) {
            case 'attack':
                dx = width * (1 - easingFunctions.easeOutExpo(p));
                rectangle.x = x - dx;
                rectangle.opacity = af.lerp(0, 1, progress);
                return [rectangle];
            case 'decay':
                return [rectangle];
            case 'sustain':
                return [rectangle];
            case 'release':
                dx = width * easingFunctions.easeInExpo(p);
                rectangle.x = x + dx;
                rectangle.opacity = af.lerp(1, 0, progress);
                return [rectangle];
            default:
                return [rectangle];
        }
    }
}

registerAnimation({ name: 'slide', label: 'Slide', class: SlideAnimation });
