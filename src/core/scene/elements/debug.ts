import { SceneElement } from './base';
import { EnhancedConfigSchema } from '@core/types';
import { EmptyRenderObject, Rectangle, RenderObject, Text } from '@core/render/render-objects';

// Minimal DebugElement for testing/inheritance demonstration
export class DebugElement extends SceneElement {
    constructor(id: string | null = null, config: { [key: string]: any } = {}) {
        super('debug', id, config);
        // Set default position using the new offset properties if not specified in config
        if (!('offsetX' in config)) {
            this.setProperty('offsetX', 750);
        }
        if (!('offsetY' in config)) {
            this.setProperty('offsetY', 750);
        }
        this.setAnchor(0, 0);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Debug',
            description: 'Debugging information display',
            category: 'Misc',
            groups: [
                ...base.groups,
                {
                    id: 'debug',
                    label: 'Debug',
                    collapsed: false,
                    properties: [
                        {
                            key: 'showDots',
                            type: 'boolean',
                            label: 'Show Dots',
                            default: true,
                            description: 'show dots',
                        },
                    ],
                },
            ],
        };
    }

    /**
     * Renders an array of points as rectangles with coordinate labels
     * config.points: Array<{ x: number, y: number }>
     */
    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        let objects: RenderObject[] = [];
        const empty1 = new EmptyRenderObject();
        const rect1 = new Rectangle(0, 0, 50, 50, '#ff0000');
        const rect2 = new Rectangle(50, 50, 50, 50, '#00ff00');
        const rect3 = new Rectangle(100, 100, 50, 50, '#0000ff');
        const rect4 = new Rectangle(150, 150, 50, 50, '#ffff00');
        const rect5 = new Rectangle(0, 0, 50, 50, '#ff00ff');

        rect2.setIncludeInLayoutBounds(false);
        rect3.setScale(2, 1);
        rect4.setRotation(45);
        rect4.x = 200;
        rect4.setIncludeInLayoutBounds(false);

        rect5.setRotation(180);
        rect5.setIncludeInLayoutBounds(false);

        empty1.addChild(rect1);
        empty1.addChild(rect2);
        empty1.addChild(rect3);
        empty1.addChild(rect4);
        empty1.addChild(rect5);
        empty1.setIncludeInLayoutBounds(true);
        objects.push(rect1, rect2, rect3, rect4, rect5);
        return objects;
    }

    protected estimateScreenSpaceLocation(
        width: number,
        height: number,
        localPoint: { x: number; y: number }
    ): { x: number; y: number } {
        const t = {
            x: Number(this.getProperty('offsetX')) || 0,
            y: Number(this.getProperty('offsetY')) || 0,
            scaleX: Number(this.getProperty('elementScaleX')) || 1,
            scaleY: Number(this.getProperty('elementScaleY')) || 1,
            skewX: Number(this.getProperty('elementSkewX')) || 0,
            skewY: Number(this.getProperty('elementSkewY')) || 0,
            rot: Number(this.getProperty('elementRotation')) || 0,
            anchorX: (Number(this.getProperty('anchorX')) || 0) * width,
            anchorY: (Number(this.getProperty('anchorY')) || 0) * height,
        };

        // Step 1: subtract anchor
        let x = Number(localPoint.x) - t.anchorX;
        let y = Number(localPoint.y) - t.anchorY;

        // Step 2: scale
        x *= t.scaleX;
        y *= t.scaleY;

        // Step 3: skew
        if (t.skewX !== 0 || t.skewY !== 0) {
            // skewX: x' = x + skewX * y
            // skewY: y' = y + skewY * x
            const skewXRadians = (t.skewX * Math.PI) / 180;
            const skewYRadians = (t.skewY * Math.PI) / 180;
            x = x + Math.tan(skewXRadians) * y;
            y = y + Math.tan(skewYRadians) * x;
        }

        // Step 4: rotation
        if (t.rot !== 0) {
            const rad = (t.rot * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;
            x = rx;
            y = ry;
        }

        // Step 5: add anchor back
        x += t.anchorX;
        y += t.anchorY;

        // Step 6: translation
        x += t.x;
        y += t.y;

        return { x, y };
    }
}
