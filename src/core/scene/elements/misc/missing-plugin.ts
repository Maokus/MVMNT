import {
    SceneElement,
    asNumber,
    asTrimmedString,
    type EnhancedConfigSchema,
    insertElementConfig,
    tab,
} from '@mvmnt/plugin-sdk';
import { Rectangle, Text, type RenderObject } from '@mvmnt/plugin-sdk/render';

export class MissingPluginElement extends SceneElement {
    constructor(id: string = 'missingPlugin', config: { [key: string]: any } = {}) {
        super('missingPlugin', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Missing Plugin Placeholder',
                description: 'Placeholder shown when a plugin-backed element is unavailable.',
                category: 'System',
            },
            [tab.properties([
                {
                    id: 'placeholderStyle',
                    label: 'Placeholder Style',
                    collapsed: false,
                    properties: [
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 260,
                            min: 40,
                            max: 2000,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 260 },
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 140,
                            min: 40,
                            max: 2000,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 140 },
                        },
                        {
                            key: 'label',
                            type: 'string',
                            label: 'Label Override',
                            default: '',
                            runtime: { transform: asTrimmedString, defaultValue: '' },
                        },
                    ],
                },
            ])]
        );
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const width = props.width ?? 260;
        const height = props.height ?? 140;
        const labelOverride = props.label ?? '';

        const missingTypeBinding = this.getBinding('missingType');
        const missingType = missingTypeBinding ? this.getProperty<string>('missingType') : undefined;
        const missingPluginBinding = this.getBinding('missingPluginId');
        const missingPluginId = missingPluginBinding ? this.getProperty<string>('missingPluginId') : undefined;

        const title = labelOverride || 'Missing plugin';
        const subtitleParts = [
            missingPluginId ? `Plugin: ${missingPluginId}` : undefined,
            missingType ? `Type: ${missingType}` : undefined,
        ]
            .filter(Boolean)
            .join(' | ');

        const background = new Rectangle(-width / 2, -height / 2, width, height, 'rgba(70,16,24,0.8)', '#ff6478', 2);
        background.setCornerRadius(8);

        const titleText = new Text(0, -12, title, '600 16px "Inter", sans-serif', '#ffd5db', 'center', 'middle');
        const subtitleText = new Text(
            0,
            16,
            subtitleParts || 'Install required plugin to restore this element.',
            '400 12px "Inter", sans-serif',
            '#f4b7c0',
            'center',
            'middle'
        );

        return [background, titleText, subtitleText];
    }
}
