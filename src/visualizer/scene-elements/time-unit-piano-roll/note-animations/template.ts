import { Text, Rectangle, RenderObject } from '@core/render/render-objects';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '@animation/animations';
import easingsFunctions from '@animation/easings';
import seedrandom from 'seedrandom';

const ef = easingsFunctions;

export class TemplateAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block } = ctx;
        const rng = seedrandom(block.baseNoteId);
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
                return [];
        }
    }
}

// registerAnimation({ name: 'template', label: 'Template', class: TemplateAnimation });
