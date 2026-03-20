import { Text, Rectangle, RenderObject, Arc, EmptyRenderObject } from '@core/render/render-objects';
import { BaseNoteAnimation, type AnimationContext } from './base';
import { registerAnimation } from './registry';
import * as af from '@animation/anim-math';
import easingFunctions from '@animation/easing';
import seedrandom from 'seedrandom';

const ef = easingFunctions;

export class CytusishAnimation extends BaseNoteAnimation {
    render(ctx: AnimationContext): RenderObject[] {
        const { x, y, width, height, color, progress, phase, block, currentTime } = ctx;
        const cy = y + height / 2;
        const rng = seedrandom(block.baseNoteId);
        const NUM_ARCS = 5;
        const LEN_ARCS = 0.4;

        const randomFinalPos = af.lerp(-40,40,rng());

        const initialAccentProgress = new af.FloatCurve([
            [0,0,ef.linear],
            [0.1,1,ef.linear],
            [1,1,ef.linear]
        ]).valAt(progress);

        const firstHalfProgress = new af.FloatCurve([
            [0,0,ef.linear],
            [0.6,1,ef.linear],
            [1,1,ef.linear]
        ]).valAt(progress);

        const secondHalfProgress = new af.FloatCurve([
            [0,0,ef.linear],
            [0.4,0,ef.linear],
            [1,1,ef.linear]
        ]).valAt(progress);

        let objects: RenderObject[] = [];

        let outerCircle = new Arc(
            0,
            0, 
            height, 
            0, 
            Math.PI*2,
            false,
            { 
                fillColor: "#0000", 
                strokeColor: color, 
                strokeWidth: 2
            }
        );


        let shockCircle = new Arc(
            0,
            0, 
            height + 4, 
            0, 
            Math.PI*2,
            false,
            { 
                fillColor: "#0000", 
                strokeColor: color, 
                strokeWidth: 4
            }
        );
        shockCircle.opacity = 0;

        let innerCircle = new Arc(
            0,
            0,
            height*0.6,
            0,
            Math.PI * 2,
            false,
            {
                fillColor: color,
                strokeColor: "#0000",
            }
        );

        let outerArcs = new EmptyRenderObject(0, 0).addChildren(
            Array.from({ length: NUM_ARCS }, (_, i) => {
                const angle = (i / NUM_ARCS) * Math.PI * 2;
                return new Arc(
                    0,
                    0,
                    height * 1.2,
                    angle,
                    angle+LEN_ARCS,
                    false,
                    {
                        fillColor: "#0000",
                        strokeColor: color,
                        strokeWidth: 2,
                        includeInLayoutBounds: false
                    }
                );
            })
        );

        let masterGroup = new EmptyRenderObject(x, cy).addChildren([outerCircle, innerCircle, outerArcs, shockCircle]);



        switch (phase) {
            case 'attack': {
                objects.push(masterGroup);  

                outerCircle.endAngle = ef.easeOutCubic(progress) * Math.PI * 2;       

                innerCircle.radius = height * 0.6 * ef.easeOutCubic(progress);

                outerArcs.rotation = outerArcs.rotation-Math.PI/4+ef.easeOutCubic(secondHalfProgress) * Math.PI /4;

                outerArcs.getChildren().map((child) => {
                    let arc: Arc = child as Arc;
                    arc.endAngle = ef.easeOutCubic(secondHalfProgress) * LEN_ARCS + arc.startAngle;
                })
                
                break;
            }
            case "decay": {
                objects.push(masterGroup);
                let p0 = ef.easeOutCubic(initialAccentProgress);
                outerCircle.scaleX = 1 - 0.2 * p0;
                outerCircle.scaleY = 1 - 0.2 * p0;
                innerCircle.scaleX = 1 - 0.2 * p0;
                innerCircle.scaleY = 1 - 0.2 * p0;
                outerArcs.scaleX = 1 + 0.2 * p0;
                outerArcs.scaleY = 1 + 0.2 * p0;


                let p1 = ef.easeOutCubic(firstHalfProgress);

                outerCircle.scaleX += 0.3 * p1;
                outerCircle.scaleY -= 0.7 * p1;
                innerCircle.scaleX -= 0.8 * p1;
                innerCircle.scaleY += 0.5 * p1;
                outerArcs.scaleX += 0.3 * p1;
                outerArcs.scaleY -= 0.9 * p1;
                masterGroup.rotation = p1 * Math.PI /2;
                shockCircle.opacity = af.lerp(1,0,p1);

                let p2 = ef.easeInCubic(secondHalfProgress);

                outerCircle.y = height*3*p2;
                innerCircle.y = randomFinalPos*p2;
                outerArcs.y = height*3*p2;


                outerCircle.opacity = 1 - secondHalfProgress;
                innerCircle.opacity = 1 - secondHalfProgress;
                outerArcs.opacity = 1 - secondHalfProgress;

                let p3 = ef.easeOutCubic(progress);

                outerArcs.getChildren().map((child) => {
                    let arc: Arc = child as Arc;
                    arc.startAngle = arc.startAngle + Math.PI * p3;
                    arc.endAngle = arc.endAngle + Math.PI * p3;
                })

                break;
            }
            case 'sustain':
                break;
            case 'release': 
                break;
            default:
                return [];
        }

        return objects;
    }
}

registerAnimation({ name: 'cytusish', label: 'Cytusish', class: CytusishAnimation });

