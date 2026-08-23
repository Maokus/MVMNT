import { describe, expect, expectTypeOf, it } from 'vitest';
import { definePluginElement, type PropsFromSchema } from '../../../../../packages/plugin-sdk/src/scene';

const schema = {
    tabs: [
        {
            id: 'properties',
            label: 'Properties',
            groups: [
                {
                    id: 'main',
                    label: 'Main',
                    collapsed: false,
                    properties: [
                        { key: 'size', label: 'Size', type: 'number', default: 24 },
                        { key: 'opacity', label: 'Opacity', type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
                        { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
                        { key: 'color', label: 'Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                        {
                            key: 'align',
                            label: 'Alignment',
                            type: 'select',
                            default: 'left',
                            options: [
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ],
                        },
                        { key: 'trackIds', label: 'Tracks', type: 'timelineTrackRef', allowMultiple: true },
                        { key: 'imageId', label: 'Image', type: 'assetRef' },
                    ],
                    layout: [
                        { kind: 'control', control: 'slider', bindings: { value: 'opacity' } },
                        { kind: 'property', propertyKey: 'opacity' },
                    ],
                },
            ],
        },
    ],
} as const;

describe('schema-inferred plugin props', () => {
    it('infers callback props and instance state from the schema', () => {
        const definition = definePluginElement({
            type: 'schema-props',
            metadata: { name: 'Schema Props' },
            schema,
            create(props, context) {
                expectTypeOf(props).toEqualTypeOf<PropsFromSchema<typeof schema>>();
                expectTypeOf(props.size).toEqualTypeOf<number>();
                expectTypeOf(props.opacity).toEqualTypeOf<number>();
                expectTypeOf(props.enabled).toEqualTypeOf<boolean>();
                expectTypeOf(props.color).toEqualTypeOf<string>();
                expectTypeOf(props.align).toEqualTypeOf<'left' | 'right'>();
                expectTypeOf(props.trackIds).toEqualTypeOf<readonly string[] | null>();
                expectTypeOf(props.imageId).toEqualTypeOf<string | null>();
                expectTypeOf(context.properties.valueAt('size', 1)).toEqualTypeOf<
                    import('../../../../../packages/plugin-sdk/src/api').Result<number>
                >();
                expectTypeOf(context.properties.integrate('opacity', { startSeconds: 0, endSeconds: 1 })).toEqualTypeOf<
                    import('../../../../../packages/plugin-sdk/src/api').Result<number>
                >();
                if (false) {
                    // @ts-expect-error Boolean properties cannot be integrated.
                    context.properties.integrate('enabled', { startSeconds: 0, endSeconds: 1 });
                    // @ts-expect-error Unknown properties cannot be sampled.
                    context.properties.valueAt('missing', 0);
                }
                return { frames: 0 };
            },
            render(props, instanceState) {
                expectTypeOf(props.align).toEqualTypeOf<'left' | 'right'>();
                expectTypeOf(instanceState).toEqualTypeOf<{ frames: number }>();
                return [];
            },
            dispose(instanceState) {
                expectTypeOf(instanceState).toEqualTypeOf<{ frames: number }>();
            },
        });

        expect(definition.type).toBe('schema-props');
    });

    it('preserves the explicit props and instance-state generic form', () => {
        interface LegacyProps extends Readonly<Record<string, unknown>> {
            readonly label: string;
        }
        interface ExplicitInstanceState {
            frames: number;
        }

        const definition = definePluginElement<LegacyProps, ExplicitInstanceState>({
            type: 'legacy-props',
            metadata: { name: 'Legacy Props' },
            schema: { tabs: [] },
            create(props) {
                expectTypeOf(props.label).toEqualTypeOf<string>();
                return { frames: 0 };
            },
            render(props, instanceState) {
                expectTypeOf(props.label).toEqualTypeOf<string>();
                expectTypeOf(instanceState.frames).toEqualTypeOf<number>();
                return [];
            },
        });

        expect(definition.type).toBe('legacy-props');
    });

    it('requires synchronous instance disposal', () => {
        definePluginElement({
            type: 'synchronous-disposal',
            metadata: { name: 'Synchronous disposal' },
            schema: { tabs: [] },
            render() {
                return [];
            },
            // @ts-expect-error Instance disposal cannot return a promise.
            async dispose() {},
        });
    });
});
