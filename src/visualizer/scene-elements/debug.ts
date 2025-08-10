import { SceneElement } from './base';
import { EnhancedConfigSchema, RenderObjectInterface } from '../types';
import { Rectangle, Text } from '../render-objects';

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
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Debug',
            description: 'Debugging information display',
            category: 'misc',
            groups: [
                ...base.groups,
                {
                    id: 'debug',
                    label: 'Debug',
                    collapsed: false,
                    properties: [
                        { key: 'showDots', type: 'boolean', label: 'Show Dots', default: true, description: 'show dots' }
                    ]
                }
            ]
        };
    }

    /**
     * Renders an array of points as rectangles with coordinate labels
     * config.points: Array<{ x: number, y: number }>
     */
    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        const points: Array<{ x: number, y: number }> = [];
        const objects: RenderObjectInterface[] = [];

        for(let i=0; i<10; i++){
            for(let j=0; j<10; j++){
                points.push({x:i*100, y:j*100})
            }
        }
        if(config.showDots){
            for (const pt of points) {
                // Rectangle at point (yellow fill, no stroke)
                objects.push(new Rectangle(pt.x - 5, pt.y - 5, 4, 4, '#fff', null, 1));
                // Text label for coordinates (font, color, align)
                objects.push(new Text(pt.x + 4, pt.y+4, `(${pt.x},${pt.y})`, '12px Arial', '#FFF', 'left', 'middle'));
            }
        }
        return objects;
    }
}
