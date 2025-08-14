import { Text } from '../../../render-objects/text.js';
import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base.js';
import { registerAnimation } from './registry.js';
import seedrandom from 'seedrandom';

export class ExplodeAnimation extends BaseNoteAnimation {
    constructor() {
        super();
    }

    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;

        const rng = seedrandom(block.baseNoteId);
        let randPerNote = rng();
        let timeSinceStart = currentTime - block.startTime;

        const info = `${timeSinceStart}`;

        switch (phase) {
            case 'attack': {
                return [];
            }
            case 'decay': {
                return [new Text(x, y, `${info}`)];
            }
            case 'sustain':
                return [new Text(x, y, `${info}`)];
            case 'release': {
                return [];
            }
            default:
                return [this.rect(x, y, width, height, color, 0.8)];
        }
    }
}

registerAnimation({ name: 'explode', label: 'Explode', class: ExplodeAnimation });
