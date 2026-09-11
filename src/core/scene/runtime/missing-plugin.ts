import { BoundSceneElement, asNumber, asTrimmedString } from '@core/scene/runtime/bound-scene-element';
import type { EnhancedConfigSchema } from '@core/scene/runtime/schema';
import { insertElementConfig } from '@core/scene/runtime/schema-builders';
import { tab } from '@core/scene/built-ins/schema-groups';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';

export class MissingPluginElement extends BoundSceneElement {
    private readonly missingType?: string;
    private readonly missingPluginId?: string;

    constructor(
        id: string = 'missingPlugin',
        options: {
            visible?: unknown;
            missingType?: string;
            missingPluginId?: string;
        } = {}
    ) {
        // A missing element's schema is unrelated to the unavailable plugin's schema.
        // Only carry visibility into the fallback; same-named plugin properties such as
        // width, height, or label must not resize or hide the diagnostic placeholder.
        super('missingPlugin', id, options.visible === undefined ? {} : { visible: options.visible });
        this.missingType = options.missingType;
        this.missingPluginId = options.missingPluginId;
    }

    static getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Missing Plugin Placeholder',
                description: 'Placeholder shown when a plugin-backed element is unavailable.',
                category: 'System',
            },
            [
                tab.properties([
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
                ]),
            ]
        );
    }

    protected _buildRenderObjects(_config: any, _targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        const width = props.width ?? 260;
        const height = props.height ?? 140;
        const labelOverride = props.label ?? '';

        const title = labelOverride || 'Missing plugin';
        const subtitleParts = [
            this.missingPluginId ? `Plugin: ${this.missingPluginId}` : undefined,
            this.missingType ? `Type: ${this.missingType}` : undefined,
        ]
            .filter(Boolean)
            .join(' | ');

        const background = new Rectangle(-width / 2, -height / 2, width, height, {
            fillColor: 'rgba(70,16,24,0.8)',
            strokeColor: '#ff6478',
            strokeWidth: 2,
        });
        background.setCornerRadius(8);

        const titleText = new Text(0, -12, title, '600 16px "Inter", sans-serif', {
            color: '#ffd5db',
            align: 'center',
            baseline: 'middle',
        });
        const subtitleText = new Text(
            0,
            16,
            subtitleParts || 'Install required plugin to restore this element.',
            '400 12px "Inter", sans-serif',
            { color: '#f4b7c0', align: 'center', baseline: 'middle' }
        );

        return [background, titleText, subtitleText];
    }
}
