import { RenderObject, EmptyRenderObject, Poly, Rectangle, Text } from '@core/render/render-objects';
import easingFunctions from '@animation/easing.js';
import { BaseNoteAnimation, type AnimationContext } from './base.js';
import { registerAnimation } from './registry.js';
import seedrandom from 'seedrandom';
import * as af from '@animation/anim-math.js';

export class ExplodeAnimation extends BaseNoteAnimation {
    constructor() {
        super();
    }

    lerp2d(x1: number, y1: number, x2: number, y2: number, fac: number): { x: number; y: number } {
        return { x: x1 + (x2 - x1) * fac, y: y1 + (y2 - y1) * fac };
    }

    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;

        const rng = seedrandom(block.baseNoteId);
        let randPerNote = rng();
        let timeSinceStart = currentTime - block.startTime;

        let numOfObjs = Math.floor(rng() * 10) + 4;
        let objs = [];

        for (let i = 0; i < numOfObjs; i++) {
            // Create individual objects for the explosion effect
            objs.push({
                endX: rng() * 100 + x,
                endY: rng() * height * 2 + y - height,
                endRot: rng() * 9,
                shape: Math.floor(rng() * 3),
            });
        }

        const info = `${timeSinceStart}`;

        switch (phase) {
            case 'attack': {
                let hh = height / 2;
                let arrow = new Poly([
                    [x, y + hh - af.lerp(0, hh, progress)],
                    [x, y + hh + af.lerp(0, hh, progress)],
                    [x - 40 * easingFunctions.easeInQuart(progress), y + height / 2],
                ]);
                arrow.opacity = af.lerp(0, 1, progress);
                arrow.strokeColor = color;
                arrow.lineJoin = 'bevel';
                return this.markNonLayout([arrow]);
            }
            case 'decay': {
                let renderObjs: RenderObject[] = [];

                let burst = new EmptyRenderObject();
                (burst as any).setIncludeInLayoutBounds?.(false);
                for (let i = 0; i < objs.length; i++) {
                    let renderObj;
                    if (objs[i].shape == 0) {
                        renderObj = new Rectangle(0, 0, 20, 20);
                        renderObj.fillColor = color;
                    } else if (objs[i].shape == 1) {
                        renderObj = new Poly([
                            [0, 0],
                            [20, 0],
                            [10, 15],
                        ]);
                        renderObj.strokeColor = color;
                        renderObj.strokeWidth = 5;
                    } else {
                        renderObj = new Rectangle(0, 0, 20, 10);
                        renderObj.fillColor = color;
                    }
                    let objBounds = renderObj.getBounds();
                    renderObj.x = -objBounds.width / 2;
                    renderObj.y = -objBounds.height / 2;
                    let parent = new EmptyRenderObject();
                    (parent as any).setIncludeInLayoutBounds?.(false);
                    parent.addChild(renderObj);
                    parent.x = af.lerp(x, objs[i].endX, easingFunctions.easeOutExpo(progress));
                    parent.y = af.lerp(y, objs[i].endY, easingFunctions.easeOutExpo(progress));
                    parent.opacity = 1 - progress;
                    parent.rotation = af.lerp(0, objs[i].endRot, easingFunctions.easeOutQuad(progress));
                    burst.addChild(parent);
                }

                burst.y += height / 2;
                renderObjs.push(burst);
                let skeleton = new Rectangle(
                    x,
                    y,
                    af.lerp(0, width, easingFunctions.easeOutExpo(progress)),
                    height,
                    'rgba(0,0,0,0)',
                    color,
                    2
                );
                skeleton.opacity = 1;

                renderObjs.push(skeleton);

                return this.markNonLayout(renderObjs);
            }
            case 'sustain':
                let skeleton = new Rectangle(x, y, width, height, 'rgba(0,0,0,0)', color, 2);
                skeleton.opacity = 1;
                return this.markNonLayout([skeleton]);
            case 'release': {
                let skeleton = new Rectangle(x, y, width, height, 'rgba(0,0,0,0)', color, 2);
                skeleton.opacity = af.lerp(1, 0, progress);
                return this.markNonLayout([skeleton]);
            }
            default:
                return this.markNonLayout([new Rectangle(x, y, width, height, color)]);
        }
    }
}

registerAnimation({ name: 'explode', label: 'Explode', class: ExplodeAnimation });
