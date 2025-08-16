import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import easingFunctions from '@animation/easing';
import { Rectangle, RenderObject } from '@core/render/render-objects';

export class ExpandAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;
        const p = Math.max(0, Math.min(1, progress));

        switch (phase) {
            case 'attack': {
                return [];
            }
            case 'decay': {
                const w = Math.max(1, width * easingFunctions.easeOutQuint(p));
                return [new Rectangle(x, y, w, height, color)];
            }
            case 'sustain': {
                return [new Rectangle(x, y, width, height, color)];
            }
            case 'release': {
                const w = Math.max(1, width * (1 - easingFunctions.easeOutExpo(p)));
                return [new Rectangle(x + width - w, y, w, height, color)];
            }
            default:
                return [new Rectangle(x, y, width, height, color)];
        }
    }
}

registerAnimation({ name: 'expand', label: 'Expand', class: ExpandAnimation });
