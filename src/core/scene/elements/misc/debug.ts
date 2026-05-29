import { SceneElement, type EnhancedConfigSchema, prop, insertElementConfig, tab } from '@mvmnt/plugin-sdk';
import { EmptyRenderObject, Rectangle, type RenderObject, Text } from '@mvmnt/plugin-sdk/render';

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
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Debug',
                description: 'Debugging information display',
                category: 'Misc',
            },
            [
                tab.properties([
                    {
                        id: 'debugSettings',
                        label: 'Debug Tools',
                        collapsed: false,
                        description: 'Toggle helper visuals for layout debugging.',
                        properties: [
                            prop.boolean('showDots', 'Show Alignment Dots', true),
                            prop.imageAsset('imageSource', 'Image input'),
                        ],
                    },
                ]),
            ]
        );
    }

    /**
     * Renders an array of points as rectangles with coordinate labels
     * config.points: Array<{ x: number, y: number }>
     */
    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const objects: RenderObject[] = [];
        const empty1 = new EmptyRenderObject();
        const rect1 = new Rectangle(0, 0, 50, 50, { fillColor: '#ff0000' });
        const rect2 = new Rectangle(50, 50, 50, 50, { fillColor: '#00ff00' });
        const rect3 = new Rectangle(100, 100, 50, 50, { fillColor: '#0000ff' });
        const rect4 = new Rectangle(150, 150, 50, 50, { fillColor: '#ffff00' });
        const rect5 = new Rectangle(0, 0, 50, 50, { fillColor: '#ff00ff' });

        rect2.setIncludeInLayoutBounds(false);
        rect3.scaleX = 2;
        rect3.scaleY = 1;
        rect4.rotation = 45;
        rect4.x = 200;
        rect4.setIncludeInLayoutBounds(false);

        rect5.rotation = 180;
        rect5.setIncludeInLayoutBounds(false);

        empty1.addChild(rect1);
        empty1.addChild(rect2);
        empty1.addChild(rect3);
        empty1.addChild(rect4);
        empty1.addChild(rect5);
        empty1.setIncludeInLayoutBounds(true);
        objects.push(rect1, rect2, rect3, rect4, rect5);

        objects.push(new Text(0, 0, `${props.imageSource}`));
        return objects;
    }

    protected estimateScreenSpaceLocation(
        width: number,
        height: number,
        localPoint: { x: number; y: number }
    ): { x: number; y: number } {
        const props = this.getSchemaProps();

        const t = {
            x: props.offsetX ?? 0,
            y: props.offsetY ?? 0,
            scaleX: props.elementScaleX ?? 1,
            scaleY: props.elementScaleY ?? 1,
            skewX: props.elementSkewX ?? 0,
            skewY: props.elementSkewY ?? 0,
            rot: props.elementRotation ?? 0,
            anchorX: (props.anchorX ?? 0) * width,
            anchorY: (props.anchorY ?? 0) * height,
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
