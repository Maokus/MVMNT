import { Rectangle, RenderObject } from '@core/render/render-objects';
import easingFunctions from '@animation/easing';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '@animation/anim-math.js';

const ef = easingFunctions;

export class FadeAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        let rect = new Rectangle(x, y, width, height, color);
        switch (phase) {
            case 'attack':
                // Subtle preview before the note starts
                rect.opacity = af.lerp(0, 1, progress);
                break;
            case 'decay':
                break;
            case 'sustain':
                break;
            case 'release':
                rect.opacity = af.lerp(1, 0, progress);
                break;
            case 'static':
            default:
                break;
        }
        return this.markNonLayout([rect]);
    }
}

registerAnimation({ name: 'fade', label: 'Fade In/Out', class: FadeAnimation });
