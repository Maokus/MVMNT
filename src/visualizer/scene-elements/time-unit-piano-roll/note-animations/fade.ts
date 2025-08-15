import { Rectangle } from '../../../render-objects/rectangle.js';
import type { RenderObjectInterface } from '../../../types.js';
import easingsFunctions from '../../../utils/easings';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '../../../utils/animations';

const ef = easingsFunctions;

export class FadeAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObjectInterface[] {
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
        return [rect];
    }
}

registerAnimation({ name: 'fade', label: 'Fade In/Out', class: FadeAnimation });
