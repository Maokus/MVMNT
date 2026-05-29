// Background element for rendering the main background with property bindings
import { SceneElement, type EnhancedConfigSchema, insertElementConfig, propGroup, tab } from '@mvmnt/plugin-sdk';
import { Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import { applyOpacity } from '@utils/color';

export class BackgroundElement extends SceneElement {
    constructor(id: string = 'background', config: { [key: string]: any } = {}) {
        super('background', id, config);
        const defaults = {
            anchorX: 0,
            anchorY: 0,
            offsetX: 0,
            offsetY: 0,
            zIndex: -1000,
            color: '#1a1a1a',
            opacity: 1,
        };

        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in config)) {
                this.setProperty(key, value);
            }
        }
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Background',
                description: 'Solid background color for the visualization',
                category: 'Misc',
            },
            [tab.appearance([propGroup.appearance()])]
        );
    }

    protected _buildRenderObjects(config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const { canvas } = config;
        const fill = applyOpacity(
            props.color ?? props.backgroundColor ?? '#1a1a1a',
            props.opacity ?? props.backgroundOpacity ?? 1
        );
        return [new Rectangle(0, 0, canvas.width, canvas.height, { fillColor: fill })];
    }
}
