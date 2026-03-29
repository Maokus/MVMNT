import { Text, Rectangle, RenderObject, EmptyRenderObject, Arc } from '@core/render/render-objects';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '@math/animation/anim-math';
import easingFunctions from '@math/animation/easing';
import seedrandom from 'seedrandom';

const ef = easingFunctions;

export class BonkAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;
        const rng = seedrandom(block.baseNoteId);
        const info = `${(progress * 100).toFixed(0)}%`;
        
        let master = new EmptyRenderObject(x, y);
        let mainCircle = new Arc(0,0,height,0,Math.PI*2,false,{fillColor: color, strokeColor: 'transparent'});
        master.addChild(mainCircle);

        const initialAccentProgress = new af.FloatCurve([
            [0,0,ef.linear],
            [0.1,1,ef.linear],
            [1,1,ef.linear]
        ]).valAt(progress);

        const firstHalfProgress = new af.FloatCurve([
            [0,0,ef.linear],
            [0.5+rng()*0.2,1,ef.linear],
            [1,1,ef.linear]
        ]).valAt(progress);

        const secondHalfProgress = new af.FloatCurve([
            [0,0,ef.linear],
            [0.4,0,ef.linear],
            [1,1,ef.linear]
        ]).valAt(progress);

        switch (phase) {
            case 'attack': {
                mainCircle.x = 100;
                mainCircle.y = af.remap(0,1,100,0,ef.easeOutCubic(firstHalfProgress));
                mainCircle.opacity = firstHalfProgress;
                mainCircle.x = af.remap(0,1,100,0,ef.easeInCubic(secondHalfProgress));
                mainCircle.scaleY = af.remap(0,1,1,0.8, ef.easeInCubic(secondHalfProgress))
                mainCircle.scaleX = af.remap(0,1,1,1.2, ef.easeInCubic(secondHalfProgress))
                return this.markNonLayout([master]);
            }
            case 'decay': {
                mainCircle.x = af.remap(0,1,0,-100,ef.easeOutCubic(firstHalfProgress));
                mainCircle.scaleY = af.remap(0,1,0.8,1, ef.easeOutCubic(secondHalfProgress))
                mainCircle.scaleX = af.remap(0,1,1.2,1, ef.easeOutCubic(secondHalfProgress))
                mainCircle.opacity = 1 - secondHalfProgress;
                return this.markNonLayout([master]);
            }
            case 'sustain':
                break;
            case 'release': {
                break;
            }
            default:
        }
        return [];
    }
}

// To create a new animation from this template:
//   1. Copy this file to a new name (e.g. my-animation.ts) in this directory.
//   2. Change the class name and the content of render() to implement your animation.
//   3. Uncomment the registerAnimation() call below (and fill in name/label).
//   4. index.ts auto-imports all *.ts files in this directory except template.ts,
//      so your new file will be bundled and registered automatically.
registerAnimation({ name: 'bonk', label: 'Bonk', class: BonkAnimation });
