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
    it('defaults to stateless named inputs and infers asynchronous resources', () => {
        definePluginElement({
            type: 'stateless',
            metadata: { name: 'Stateless' },
            schema,
            render({ props, resources, time }) {
                expectTypeOf(resources).toEqualTypeOf<undefined>();
                expectTypeOf(props.size).toEqualTypeOf<number>();
                expectTypeOf(time.seconds).toEqualTypeOf<number>();
                return [];
            },
        });
        definePluginElement({
            type: 'async-resources',
            metadata: { name: 'Async resources' },
            schema,
            async createResources(context) {
                if (false) {
                    // @ts-expect-error Cleanup must be synchronous.
                    context.onCleanup(async () => {});
                }
                return { buffer: new Float32Array(4) };
            },
            render({ resources }) {
                expectTypeOf(resources.buffer).toEqualTypeOf<Float32Array<ArrayBuffer>>();
                return [];
            },
        });
        if (false) {
            // @ts-expect-error Non-undefined resources require initialization.
            definePluginElement<{}, { buffer: Float32Array }>({
                type: 'missing-setup',
                metadata: { name: 'Missing setup' },
                schema,
                render() {
                    return [];
                },
            });
            // @ts-expect-error Disposal requires initialization, even for undefined resources.
            definePluginElement<{}, undefined>({
                type: 'missing-setup',
                metadata: { name: 'Missing setup' },
                schema,
                disposeResources() {
                    return undefined;
                },
                render() {
                    return [];
                },
            });
        }
    });

    it('rejects superseded hooks and malformed resource lifecycles at runtime', () => {
        const base = {
            type: 'invalid',
            metadata: { name: 'Invalid' },
            schema,
            render() {
                return [];
            },
        };
        expect(() => definePluginElement({ ...base, create() {} } as any)).toThrow('createResources');
        expect(() => definePluginElement({ ...base, dispose() {} } as any)).toThrow('disposeResources');
        expect(() => definePluginElement({ ...base, createResources: 1 } as any)).toThrow('must be a function');
        expect(() => definePluginElement({ ...base, disposeResources() {} } as any)).toThrow(
            'requires createResources'
        );
    });

    it('infers callback props and instance state from the schema', () => {
        const definition = definePluginElement({
            type: 'schema-props',
            metadata: { name: 'Schema Props' },
            schema,
            createResources(context) {
                if (false) {
                    // @ts-expect-error Setup has no property sampling API.
                    context.properties;
                    // @ts-expect-error Setup has no timeline sampling API.
                    context.timeline;
                }
                return { buffer: new Float32Array(4) };
            },
            render({ props, resources, context }) {
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
                expectTypeOf(props.align).toEqualTypeOf<'left' | 'right'>();
                expectTypeOf(resources).toEqualTypeOf<{ buffer: Float32Array<ArrayBuffer> }>();
                return [];
            },
            disposeResources(resources) {
                expectTypeOf(resources).toEqualTypeOf<{ buffer: Float32Array<ArrayBuffer> }>();
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
            createResources() {
                return { frames: 0 };
            },
            render({ props, resources }) {
                expectTypeOf(props.label).toEqualTypeOf<string>();
                expectTypeOf(resources.frames).toEqualTypeOf<number>();
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
            createResources() {
                return {};
            },
            render() {
                return [];
            },
            // @ts-expect-error Instance disposal cannot return a promise.
            async disposeResources() {},
        });
    });
});
