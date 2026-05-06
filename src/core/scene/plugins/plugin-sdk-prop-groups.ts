import type { PropertyDefinition, PropertyGroup, PropertyVisibilityCondition } from '@core/types';
import { prop } from './plugin-sdk-prop-factories';

// ─── Blend mode choices ──────────────────────────────────────────────────────

/** Canonical 16-entry blend mode list for use with `prop.select`. `source-over` (Normal) is first. */
export const BLEND_MODE_CHOICES = [
    { value: 'source-over', label: 'Normal' },
    { value: 'screen', label: 'Screen' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'darken', label: 'Darken' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'color-dodge', label: 'Color Dodge' },
    { value: 'color-burn', label: 'Color Burn' },
    { value: 'hard-light', label: 'Hard Light' },
    { value: 'soft-light', label: 'Soft Light' },
    { value: 'difference', label: 'Difference' },
    { value: 'exclusion', label: 'Exclusion' },
    { value: 'hue', label: 'Hue' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'color', label: 'Color' },
    { value: 'luminosity', label: 'Luminosity' },
] as const;

// ─── Option types ────────────────────────────────────────────────────────────

interface AppearanceOpts {
    /** Add a Blend Mode selector to the group. */
    blendMode?: boolean;
    /** Override the group label (default: `'Appearance'`). */
    label?: string;
    /** Override the group id (default: `'appearance'`). */
    id?: string;
    /**
     * Prefix all property keys (e.g. `'fill'` → `fillColor`, `fillOpacity`, `fillBlendMode`).
     * Property labels remain 'Color', 'Opacity', 'Blend Mode' — the group label provides context.
     * Use this when a single element needs multiple appearance-style groups without key collisions.
     */
    keyPrefix?: string;
}

interface TypographyOpts {
    /** Add stroke color + width props. */
    stroke?: boolean;
    /** Add a text shadow toggle + sub-props. */
    textShadow?: boolean;
}

interface BorderOpts {
    /** Add a corner radius prop. */
    cornerRadius?: boolean;
    /** Override the group label (default: `'Border'`). */
    label?: string;
    /** Override the group id (default: `'border'`). */
    id?: string;
    /**
     * Prefix all property keys (e.g. `'inner'` → `innerBorderColor`, `innerBorderWidth`).
     * Use this when a single element needs multiple border-style groups without key collisions.
     */
    keyPrefix?: string;
}

// ─── propGroup namespace ─────────────────────────────────────────────────────

/**
 * Pre-built `PropertyGroup` factories for common design-system prop sets.
 * Each function returns a `PropertyGroup` ready to pass to `insertElementGroups`.
 *
 * @example
 * return insertElementGroups(super.getConfigSchema(), { name: 'My Element' }, [
 *   propGroup.appearance({ blendMode: true }),
 *   propGroup.typography(),
 *   propGroup.shadow(),
 * ]);
 */
export const propGroup = {
    /**
     * Standard appearance group: `color`, `opacity`, optional `blendMode`.
     *
     * Pass `label` / `id` to rename the group without touching property keys.
     * Pass `keyPrefix` to prefix all property keys, enabling multiple appearance groups
     * per element without key collisions (e.g. `keyPrefix: 'fill'` → `fillColor`, `fillOpacity`).
     *
     * Pair with Phase 1 `colorAlpha` splits — elements that already have
     * `color`+`opacity` props can adopt this group directly.
     */
    appearance(opts?: AppearanceOpts): PropertyGroup {
        const prefix = opts?.keyPrefix ?? '';
        const keyFor = (base: string) => (prefix ? `${prefix}${base[0].toUpperCase()}${base.slice(1)}` : base);
        return {
            id: opts?.id ?? 'appearance',
            label: opts?.label ?? 'Appearance',
            variant: 'basic',
            collapsed: false,
            properties: [
                prop.color(keyFor('color'), 'Color', '#ffffff'),
                prop.range(keyFor('opacity'), 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
                ...(opts?.blendMode
                    ? [
                          prop.select(
                              keyFor('blendMode'),
                              'Blend Mode',
                              'source-over',
                              BLEND_MODE_CHOICES as unknown as Array<{ value: string; label: string }>,
                              {
                                  description: 'Canvas composite blending operation.',
                              }
                          ),
                      ]
                    : []),
            ],
        };
    },

    /**
     * Standard typography group: `fontFamily`, `fontSize`, `textAlign`, `letterSpacing`,
     * with opt-in `stroke` (color + width) and `textShadow` sub-props.
     */
    typography(opts?: TypographyOpts): PropertyGroup {
        return {
            id: 'typography',
            label: 'Typography',
            variant: 'basic',
            collapsed: false,
            properties: [
                prop.font('fontFamily', 'Font Family', 'Inter|400'),
                prop.number('fontSize', 'Font Size', 24, { min: 4, max: 400, step: 1 }),
                prop.select('textAlign', 'Alignment', 'center', [
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                ]),
                prop.range('letterSpacing', 'Letter Spacing', 0, { min: -20, max: 100, step: 0.5 }),
                ...(opts?.stroke
                    ? [
                          prop.color('strokeColor', 'Stroke Color', '#000000'),
                          prop.range('strokeWidth', 'Stroke Width', 0, { min: 0, max: 20, step: 0.5 }),
                      ]
                    : []),
                ...(opts?.textShadow
                    ? [
                          prop.boolean('textShadowEnabled', 'Text Shadow', false),
                          prop.color('textShadowColor', 'Shadow Color', '#000000', {
                              visibleWhen: [{ key: 'textShadowEnabled', equals: true }],
                          }),
                          prop.number('textShadowBlur', 'Shadow Blur', 4, {
                              min: 0,
                              max: 100,
                              step: 1,
                              visibleWhen: [{ key: 'textShadowEnabled', equals: true }],
                          }),
                          prop.number('textShadowOffsetX', 'Shadow Offset X', 0, {
                              min: -100,
                              max: 100,
                              step: 1,
                              visibleWhen: [{ key: 'textShadowEnabled', equals: true }],
                          }),
                          prop.number('textShadowOffsetY', 'Shadow Offset Y', 2, {
                              min: -100,
                              max: 100,
                              step: 1,
                              visibleWhen: [{ key: 'textShadowEnabled', equals: true }],
                          }),
                      ]
                    : []),
            ],
        };
    },

    /**
     * Standard border group: `borderColor`, `borderWidth`, optional `cornerRadius`.
     *
     * Pass `label` / `id` to rename the group without touching property keys.
     * Pass `keyPrefix` to prefix all property keys, enabling multiple border groups
     * per element without key collisions (e.g. `keyPrefix: 'inner'` → `innerBorderColor`, `innerBorderWidth`).
     */
    border(opts?: BorderOpts): PropertyGroup {
        const prefix = opts?.keyPrefix ?? '';
        const keyFor = (base: string) =>
            prefix ? `${prefix}${base[0].toUpperCase()}${base.slice(1)}` : base;
        return {
            id: opts?.id ?? 'border',
            label: opts?.label ?? 'Border',
            variant: 'basic',
            collapsed: true,
            properties: [
                prop.color(keyFor('borderColor'), 'Border Color', '#ffffff'),
                prop.range(keyFor('borderWidth'), 'Border Width', 1, { min: 0, max: 50, step: 0.5 }),
                ...(opts?.cornerRadius
                    ? [prop.range(keyFor('cornerRadius'), 'Corner Radius', 0, { min: 0, max: 200, step: 1 })]
                    : []),
            ],
        };
    },

    /**
     * Background container group: toggle + color/opacity/padding/radius.
     * Sub-props are hidden until `showBackground` is enabled.
     */
    container(): PropertyGroup {
        return {
            id: 'container',
            label: 'Background Container',
            variant: 'advanced',
            collapsed: true,
            properties: [
                prop.boolean('showBackground', 'Show Background', false),
                prop.color('backgroundColor', 'Background Color', '#000000', {
                    visibleWhen: [{ key: 'showBackground', equals: true }],
                }),
                prop.range('backgroundOpacity', 'Background Opacity', 0.8, {
                    min: 0,
                    max: 1,
                    step: 0.01,
                    visibleWhen: [{ key: 'showBackground', equals: true }],
                }),
                prop.range('backgroundPaddingX', 'Padding X', 8, {
                    min: 0,
                    max: 200,
                    step: 1,
                    visibleWhen: [{ key: 'showBackground', equals: true }],
                }),
                prop.range('backgroundPaddingY', 'Padding Y', 4, {
                    min: 0,
                    max: 200,
                    step: 1,
                    visibleWhen: [{ key: 'showBackground', equals: true }],
                }),
                prop.range('backgroundCornerRadius', 'Corner Radius', 4, {
                    min: 0,
                    max: 200,
                    step: 1,
                    visibleWhen: [{ key: 'showBackground', equals: true }],
                }),
            ],
        };
    },

    /**
     * Drop shadow group: toggle + color/blur/offset sub-props.
     * Sub-props are hidden until `shadowEnabled` is on.
     */
    shadow(): PropertyGroup {
        return {
            id: 'shadow',
            label: 'Shadow',
            variant: 'advanced',
            collapsed: true,
            properties: [
                prop.boolean('shadowEnabled', 'Drop Shadow', false),
                prop.color('shadowColor', 'Shadow Color', '#000000', {
                    visibleWhen: [{ key: 'shadowEnabled', equals: true }],
                }),
                prop.number('shadowBlur', 'Shadow Blur (px)', 8, {
                    min: 0,
                    max: 100,
                    step: 1,
                    visibleWhen: [{ key: 'shadowEnabled', equals: true }],
                }),
                prop.number('shadowOffsetX', 'Shadow Offset X (px)', 2, {
                    min: -200,
                    max: 200,
                    step: 1,
                    visibleWhen: [{ key: 'shadowEnabled', equals: true }],
                }),
                prop.number('shadowOffsetY', 'Shadow Offset Y (px)', 2, {
                    min: -200,
                    max: 200,
                    step: 1,
                    visibleWhen: [{ key: 'shadowEnabled', equals: true }],
                }),
            ],
        };
    },

    /**
     * Audio source group: a single audio track selector.
     * @param key  Config key for the track ref (default: `'audioTrackId'`).
     */
    audioSource(key = 'audioTrackId'): PropertyGroup {
        return {
            id: 'audioSource',
            label: 'Source',
            variant: 'basic',
            collapsed: false,
            properties: [prop.audioTrack(key, 'Audio Track')],
        };
    },

    /**
     * MIDI source group: a single MIDI track selector.
     * @param key  Config key for the track ref (default: `'midiTrackId'`).
     */
    midiSource(key = 'midiTrackId'): PropertyGroup {
        return {
            id: 'midiSource',
            label: 'Source',
            variant: 'basic',
            collapsed: false,
            properties: [prop.midiTrack(key, 'MIDI Track')],
        };
    },
} as const;

// ─── colorSlotProps ──────────────────────────────────────────────────────────

/**
 * Returns a `[color, opacity]` pair of `PropertyDefinition` objects for a named visual surface.
 *
 * Keys are derived from `keyPrefix`: e.g. `colorSlotProps('bar', 'Bar')` → `barColor`, `barOpacity`.
 * Use this inside any group's `properties` array to reduce color+opacity boilerplate:
 *
 * ```ts
 * properties: [
 *   ...colorSlotProps('bar', 'Bar', '#cccccc', { visibleWhen: [{ key: 'showBar', truthy: true }] }),
 *   ...colorSlotProps('barBg', 'Bar Background', '#000000', { opacityDefault: 0.2 }),
 * ]
 * ```
 *
 * @param keyPrefix    Camel-case prefix for the generated keys (e.g. `'bar'`, `'barBg'`).
 * @param label        Human-readable surface name used in property labels (e.g. `'Bar'`).
 * @param defaultColor Hex color default (default: `'#ffffff'`).
 * @param opts         Optional overrides for opacity default, slider step, and visibility conditions.
 */
export function colorSlotProps(
    keyPrefix: string,
    label: string,
    defaultColor = '#ffffff',
    opts?: {
        opacityDefault?: number;
        step?: number;
        visibleWhen?: PropertyVisibilityCondition[];
    }
): PropertyDefinition[] {
    return prop.slot.colorOpacity(keyPrefix, label, defaultColor, opts);
}

// ─── section helpers ─────────────────────────────────────────────────────────

/**
 * Thin group factories that encode the canonical inspector section ids and labels.
 * Use these alongside `propGroup.*` to assemble schemas in a consistent order.
 *
 * Canonical section order (left to right / top to bottom in the inspector):
 * `Source → Content → Layout → Appearance → Typography → Border → Container → Effects → Advanced`
 *
 * Each helper takes a flat `PropertyDefinition[]` and returns a `PropertyGroup` with the
 * correct id, label, and `variant`. Use `propGroup.*` factories when the full standard
 * property set is needed; use `section.*` when you want the canonical id/label but with
 * element-specific properties.
 *
 * @example
 * return insertElementGroups(super.getConfigSchema(), { name: 'My Element' }, [
 *   propGroup.audioSource(),
 *   section.content([
 *     prop.boolean('showTitle', 'Show Title', true),
 *   ]),
 *   section.appearance([
 *     prop.color('color', 'Color', '#ffffff'),
 *     prop.range('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 }),
 *   ]),
 *   propGroup.typography(),
 *   propGroup.container(),
 * ]);
 */
export const section = {
    /** Groups content-selection props (toggles, text inputs, asset pickers). */
    content(properties: PropertyDefinition[]): PropertyGroup {
        return { id: 'content', label: 'Content', variant: 'basic', collapsed: false, properties };
    },

    /** Groups dimensional and positional props (width, height, padding, offsets). */
    layout(properties: PropertyDefinition[]): PropertyGroup {
        return { id: 'layout', label: 'Layout', variant: 'basic', collapsed: false, properties };
    },

    /**
     * Groups color, opacity, and blend mode props for a visual surface.
     * Pass `id` / `label` to create a named appearance section when an element
     * has multiple visual surfaces (e.g. `section.appearance([...], { id: 'fillAppearance', label: 'Fill' })`).
     */
    appearance(
        properties: PropertyDefinition[],
        opts?: { id?: string; label?: string }
    ): PropertyGroup {
        return {
            id: opts?.id ?? 'appearance',
            label: opts?.label ?? 'Appearance',
            variant: 'basic',
            collapsed: false,
            properties,
        };
    },

    /** Groups font, size, alignment, and spacing props. */
    typography(properties: PropertyDefinition[]): PropertyGroup {
        return { id: 'typography', label: 'Typography', variant: 'basic', collapsed: false, properties };
    },

    /** Groups border color, width, and radius props. */
    border(properties: PropertyDefinition[], opts?: { id?: string; label?: string }): PropertyGroup {
        return {
            id: opts?.id ?? 'border',
            label: opts?.label ?? 'Border',
            variant: 'basic',
            collapsed: true,
            properties,
        };
    },

    /** Groups background container toggle + color/padding/radius sub-props. Collapsed by default. */
    container(properties: PropertyDefinition[]): PropertyGroup {
        return { id: 'container', label: 'Background Container', variant: 'advanced', collapsed: true, properties };
    },

    /** Groups shadow, blur, and filter props. Advanced variant, collapsed by default. */
    effects(properties: PropertyDefinition[]): PropertyGroup {
        return { id: 'effects', label: 'Effects', variant: 'advanced', collapsed: true, properties };
    },

    /** Catch-all for technical or rarely-changed props. Advanced variant, collapsed by default. */
    advanced(properties: PropertyDefinition[]): PropertyGroup {
        return { id: 'advanced', label: 'Advanced', variant: 'advanced', collapsed: true, properties };
    },
} as const;
