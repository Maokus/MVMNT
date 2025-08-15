import { Text } from '../../../render-objects/text';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '../../../utils/animations'; //Anim functions
import easingsFunctions from '../../../utils/easings';
import { Rectangle, RenderObject } from '../../../render-objects';

const ef = easingsFunctions;

export class PressAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block } = ctx;

        let rect = new Rectangle(x, y, width, height, color);

        switch (phase) {
            case 'attack': {
                rect.opacity = af.lerp(0, 1, progress);
                return [rect];
            }
            case 'decay': {
                let bounceCurve = new af.FloatCurve([
                    [0, 0, ef.easeOutQuad],
                    [0.3, height, ef.easeInOutQuad],
                    [1, 0, ef.linear],
                ]);
                rect.y = y + bounceCurve.valAt(progress);
                rect.opacity = af.lerp(1, 0.8, progress);
                return [rect];
            }
            case 'sustain':
                rect.y = y;
                rect.opacity = 0.8;
                return [rect];
            case 'release': {
                rect.y = y;
                rect.opacity = af.lerp(0.8, 0, progress);
                return [rect];
            }
            default:
                return [];
        }
    }
}

registerAnimation({ name: 'press', label: 'Press', class: PressAnimation });
