import { RenderObject } from '../../../render-objects/base.js';
import { Rectangle } from '../../../render-objects/rectangle.js';
import { Text } from '../../../render-objects/text.js';
import type { RenderObjectInterface } from '../../../types.js';
import { BaseNoteAnimation, type AnimationContext } from './base.js';
import { registerAnimation } from './registry.js';
import seedrandom from 'seedrandom';

export class ExplodeAnimation extends BaseNoteAnimation {
    constructor() {
        super();
    }

    lerp2d(x1: number, y1: number, x2: number, y2: number, fac: number): { x: number; y: number } {
        return { x: x1 + (x2 - x1) * fac, y: y1 + (y2 - y1) * fac };
    }

    lerp(x1: number, x2: number, fac: number): number {
        return x1 + (x2 - x1) * fac;
    }

    render(ctx: AnimationContext): RenderObjectInterface[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;

        const rng = seedrandom(block.baseNoteId);
        let randPerNote = rng();
        let timeSinceStart = currentTime - block.startTime;

        let numOfObjs = Math.floor(rng() * 20);
        let objs = [];

        for (let i = 0; i < numOfObjs; i++) {
            // Create individual objects for the explosion effect
            objs.push({
                endX: rng() * 100 + x,
                endY: rng() * 50 + y - 25,
                endRot: rng() * 360,
            });
        }

        const info = `${timeSinceStart}`;

        switch (phase) {
            case 'attack': {
                return [];
            }
            case 'decay': {
                let renderObjs: RenderObject[] = [];
                for (let i = 0; i < objs.length; i++) {
                    let renderObj = new Rectangle(
                        this.lerp(x, objs[i].endX, progress),
                        this.lerp(y, objs[i].endY, progress),
                        20,
                        20
                    );
                    renderObj.fillColor = color;
                    renderObj.opacity = 1 - progress;
                    renderObj.rotation = this.lerp(0, objs[i].endRot, progress);
                    renderObjs.push(renderObj);
                }
                return renderObjs;
            }
            case 'sustain':
                return [];
            case 'release': {
                return [];
            }
            default:
                return [this.rect(x, y, width, height, color, 0.8)];
        }
    }
}

registerAnimation({ name: 'explode', label: 'Explode', class: ExplodeAnimation });
