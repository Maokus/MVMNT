// Background element for rendering the main background with property bindings
import { SceneElement, type EnhancedConfigSchema, prop, insertElementGroups } from '@mvmnt/plugin-sdk';
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
            backgroundColor: '#1a1a1a',
            backgroundOpacity: 1,
        };

        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in config)) {
                this.setProperty(key, value);
            }
        }
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(
            super.getConfigSchema(),
            {
                name: 'Background',
                description: 'Solid background color for the visualization',
                category: 'Misc',
            },
            [
                {
                    id: 'backgroundAppearance',
                    label: 'Background',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Set the backdrop tone for the entire scene.',
                    properties: [
                        prop.color('backgroundColor', 'Background Color', '#1a1a1a', {
                            description: 'Color fill applied behind every element.',
                        }),
                        prop.range('backgroundOpacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                    ],
                    presets: [
                        {
                            id: 'deepStage',
                            label: 'Deep Stage',
                            values: { backgroundColor: '#0f172a', backgroundOpacity: 1 },
                        },
                        {
                            id: 'warmGlow',
                            label: 'Warm Glow',
                            values: { backgroundColor: '#f59e0b', backgroundOpacity: 1 },
                        },
                        {
                            id: 'graphPaper',
                            label: 'Graph Paper',
                            values: { backgroundColor: '#111827', backgroundOpacity: 1 },
                        },
                    ],
                },
            ]
        );
    }

    protected _buildRenderObjects(config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const { canvas } = config;
        const color = applyOpacity(props.backgroundColor ?? '#1a1a1a', props.backgroundOpacity ?? 1);
        return [new Rectangle(0, 0, canvas.width, canvas.height, color)];
    }
}
