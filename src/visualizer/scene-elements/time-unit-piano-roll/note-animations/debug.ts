import { Rectangle, RenderObject } from '../../../render-objects';
import { Text } from '../../../render-objects/text';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';

export class DebugAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block } = ctx;
        const info = `${(progress * 100).toFixed(0)}%`;

        switch (phase) {
            case 'attack': {
                return [new Text(x, y, `attack ${info}`)];
            }
            case 'decay': {
                return [new Text(x, y, `decay ${info}`)];
            }
            case 'sustain':
                return [new Text(x, y, `sustain ${info}`)];
            case 'release': {
                return [new Text(x, y, `release ${info}`)];
            }
            default:
                return [new Rectangle(x, y, width, height, color)];
        }
    }
}

registerAnimation({ name: 'debug', label: 'Debug', class: DebugAnimation });
