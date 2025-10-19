// Background element for rendering the main background with property bindings
import { SceneElement, asTrimmedString } from './base';
import { Rectangle, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';

export class BackgroundElement extends SceneElement {
    constructor(id: string = 'background', config: { [key: string]: any } = {}) {
        super('background', id, config);
        // Only set defaults if not already specified in config
        const defaults = {
            anchorX: 0,
            anchorY: 0,
            offsetX: 0,
            offsetY: 0,
            zIndex: -1000, // Ensure background is always at the back
            backgroundColor: '#1a1a1a', // Default background color
        };

        // Apply defaults only for properties not already in config
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in config)) {
                this.setProperty(key, value);
            }
        }
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Background',
            description: 'Solid background color for the visualization',
            category: 'Layout',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'backgroundAppearance',
                    label: 'Background',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Set the backdrop tone for the entire scene.',
                    properties: [
                        {
                            key: 'backgroundColor',
                            type: 'color',
                            label: 'Background Color',
                            default: '#1a1a1a',
                            description: 'Color fill applied behind every element.',
                            runtime: { transform: asTrimmedString, defaultValue: '#1a1a1a' },
                        },
                    ],
                    presets: [
                        { id: 'deepStage', label: 'Deep Stage', values: { backgroundColor: '#0f172a' } },
                        { id: 'warmGlow', label: 'Warm Glow', values: { backgroundColor: '#f59e0b' } },
                        { id: 'graphPaper', label: 'Graph Paper', values: { backgroundColor: '#111827' } },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const { canvas } = config;
        const renderObjects: RenderObject[] = [];

        // Main background
        const background = new Rectangle(0, 0, canvas.width, canvas.height, props.backgroundColor);
        renderObjects.push(background);
        return renderObjects;
    }
}
