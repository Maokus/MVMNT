import { Text } from '../../../render-objects/text.js';
import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base.js';

export class RandVarAnimation extends BaseNoteAnimation {
    randvar: number;

    constructor() {
        super();
        this.randvar = Math.random();
    }

    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase } = ctx;
        const info = `${(progress * 100).toFixed(0)}%`;

        switch (phase) {
            case 'attack': {
                return [];
            }
            case 'decay': {
                return [new Text(x, y, `${this.randvar}`)];
            }
            case 'sustain':
                return [new Text(x, y, `${this.randvar}`)];
            case 'release': {
                return [new Text(x, y, `release`)];
            }
            default:
                return [this.rect(x, y, width, height, color, 0.8)];
        }
    }
}
