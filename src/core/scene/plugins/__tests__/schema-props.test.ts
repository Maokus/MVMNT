import { describe, expect, expectTypeOf, it } from 'vitest';
import { definePluginElement, type PropsFromSchema } from '../sdk/scene';

const schema = {
    tabs: [{
        id: 'properties', label: 'Properties', groups: [{
            id: 'main', label: 'Main', collapsed: false, properties: [
                { key: 'size', label: 'Size', type: 'number', default: 24 },
                { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
                { key: 'color', label: 'Color', type: 'colorAlpha', default: '#FFFFFFFF' },
                {
                    key: 'align', label: 'Alignment', type: 'select', default: 'left', options: [
                        { value: 'left', label: 'Left' },
                        { value: 'right', label: 'Right' },
                    ],
                },
                { key: 'trackIds', label: 'Tracks', type: 'timelineTrackRef', allowMultiple: true },
                { key: 'imageId', label: 'Image', type: 'assetRef' },
            ],
        }],
    }],
} as const;

describe('schema-inferred plugin props', () => {
    it('infers callback props and create state from the schema', () => {
        const definition = definePluginElement({
            type: 'schema-props',
            metadata: { name: 'Schema Props' },
            schema,
            capabilities: { required: [], optional: [] },
            create(props) {
                expectTypeOf(props).toEqualTypeOf<PropsFromSchema<typeof schema>>();
                expectTypeOf(props.size).toEqualTypeOf<number>();
                expectTypeOf(props.enabled).toEqualTypeOf<boolean>();
                expectTypeOf(props.color).toEqualTypeOf<string>();
                expectTypeOf(props.align).toEqualTypeOf<'left' | 'right'>();
                expectTypeOf(props.trackIds).toEqualTypeOf<readonly string[] | null>();
                expectTypeOf(props.imageId).toEqualTypeOf<string | null>();
                return { frames: 0 };
            },
            render(props, state) {
                expectTypeOf(props.align).toEqualTypeOf<'left' | 'right'>();
                expectTypeOf(state).toEqualTypeOf<{ frames: number }>();
                return [];
            },
        });

        expect(definition.type).toBe('schema-props');
    });

    it('preserves the explicit props and state generic form', () => {
        interface LegacyProps extends Readonly<Record<string, unknown>> { readonly label: string }
        interface LegacyState { frames: number }

        const definition = definePluginElement<LegacyProps, LegacyState>({
            type: 'legacy-props',
            metadata: { name: 'Legacy Props' },
            schema: { tabs: [] },
            capabilities: { required: [], optional: [] },
            create(props) {
                expectTypeOf(props.label).toEqualTypeOf<string>();
                return { frames: 0 };
            },
            render(props, state) {
                expectTypeOf(props.label).toEqualTypeOf<string>();
                expectTypeOf(state.frames).toEqualTypeOf<number>();
                return [];
            },
        });

        expect(definition.type).toBe('legacy-props');
    });
});
