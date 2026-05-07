import { asNumber, asBoolean, asString, asTrimmedString } from '@core/scene/elements/base';
import type { EnhancedConfigSchema, PropertyDefinition, PropertyTab, PropertyVisibilityCondition } from '@core/types';

// ─── Shared option types ────────────────────────────────────────────────────

interface CommonOpts {
    description?: string;
    visibleWhen?: PropertyVisibilityCondition[];
}

interface NumericOpts extends CommonOpts {
    min?: number;
    max?: number;
    step?: number;
}

type SelectChoice = string | { value: any; label: string };

function normalizeChoices(choices: SelectChoice[]): Array<{ value: any; label: string }> {
    return choices.map((c) => (typeof c === 'string' ? { value: c, label: c } : c));
}

// ─── prop namespace ─────────────────────────────────────────────────────────

/**
 * Factory helpers for defining element properties.
 *
 * Each factory returns a complete `PropertyDefinition` with `runtime` pre-filled,
 * so you never need to manually specify the transform or duplicate the default value.
 *
 * @example
 * properties: [
 *   prop.number('fontSize', 'Font Size (px)', 36, { min: 8, max: 160, step: 1 }),
 *   prop.colorAlpha('textColor', 'Text Color', '#FFFFFFFF'),
 *   prop.select('textAlign', 'Alignment', 'left', ['left', 'center', 'right']),
 *   prop.boolean('showBackground', 'Show Background', false),
 *   prop.font('fontFamily', 'Font Family', 'Inter'),
 *   prop.midiTrack('midiTrackId', 'MIDI Track'),
 * ]
 */
export const prop = {
    /** A finite number. Rendered as a slider/number input. */
    number(key: string, label: string, defaultValue: number, opts?: NumericOpts): PropertyDefinition {
        return {
            key,
            type: 'number',
            label,
            default: defaultValue,
            ...(opts?.min !== undefined && { min: opts.min }),
            ...(opts?.max !== undefined && { max: opts.max }),
            ...(opts?.step !== undefined && { step: opts.step }),
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asNumber, defaultValue },
        };
    },

    /** A finite number rendered as a range slider. */
    range(key: string, label: string, defaultValue: number, opts?: NumericOpts): PropertyDefinition {
        return {
            key,
            type: 'range',
            label,
            default: defaultValue,
            ...(opts?.min !== undefined && { min: opts.min }),
            ...(opts?.max !== undefined && { max: opts.max }),
            ...(opts?.step !== undefined && { step: opts.step }),
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asNumber, defaultValue },
        };
    },

    /** A boolean toggle. */
    boolean(key: string, label: string, defaultValue: boolean, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'boolean',
            label,
            default: defaultValue,
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asBoolean, defaultValue },
        };
    },

    /** A plain text string. */
    string(key: string, label: string, defaultValue: string, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'string',
            label,
            default: defaultValue,
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asString, defaultValue },
        };
    },

    /** An opaque colour (no alpha channel). Stored as a hex string. */
    color(key: string, label: string, defaultValue: string, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'color',
            label,
            default: defaultValue,
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue },
        };
    },

    /** A colour with alpha channel. Stored as an 8-digit hex string (`#RRGGBBAA`). */
    colorAlpha(key: string, label: string, defaultValue: string, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'colorAlpha',
            label,
            default: defaultValue,
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue },
        };
    },

    /** A font family picker (Google Fonts supported). Stored as a `Family|weight` string. */
    font(key: string, label: string, defaultValue: string, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'font',
            label,
            default: defaultValue,
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue },
        };
    },

    /**
     * A dropdown selector.
     *
     * `choices` accepts either plain strings (value = label) or `{ value, label }` objects:
     * ```ts
     * prop.select('align', 'Alignment', 'left', ['left', 'center', 'right'])
     * prop.select('size', 'Size', 'md', [{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }])
     * ```
     */
    select(
        key: string,
        label: string,
        defaultValue: any,
        choices: SelectChoice[],
        opts?: CommonOpts
    ): PropertyDefinition {
        return {
            key,
            type: 'select',
            label,
            default: defaultValue,
            options: normalizeChoices(choices),
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue },
        };
    },

    /**
     * A MIDI timeline track selector. Default value is `null` (no track selected).
     */
    midiTrack(key: string, label: string, opts?: CommonOpts & { allowMultiple?: boolean }): PropertyDefinition {
        return {
            key,
            type: 'timelineTrackRef',
            label,
            default: null,
            allowedTrackTypes: ['midi'],
            ...(opts?.allowMultiple && { allowMultiple: opts.allowMultiple }),
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue: null },
        };
    },

    /**
     * An audio timeline track selector. Default value is `null` (no track selected).
     */
    audioTrack(key: string, label: string, opts?: CommonOpts & { allowMultiple?: boolean }): PropertyDefinition {
        return {
            key,
            type: 'timelineTrackRef',
            label,
            default: null,
            allowedTrackTypes: ['audio'],
            ...(opts?.allowMultiple && { allowMultiple: opts.allowMultiple }),
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue: null },
        };
    },

    /**
     * A file upload field. Default value is `null` (no file selected).
     *
     * For image or GIF inputs, prefer {@link prop.imageAsset} — it integrates with the
     * visual asset registry, giving assets stable IDs that survive save/load and appear
     * in the Asset Manager panel.
     *
     * @param opts.accept  MIME type filter, e.g. `'image/*'` or `'.mp3,audio/*'`
     */
    file(key: string, label: string, opts?: CommonOpts & { accept?: string }): PropertyDefinition {
        return {
            key,
            type: 'file',
            label,
            default: null,
            ...(opts?.accept && { accept: opts.accept }),
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue: null },
        };
    },

    /**
     * An image asset selector. Picks from the project's visual asset registry.
     * Default value is `null` (no asset selected).
     */
    imageAsset(key: string, label: string, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'assetRef',
            label,
            default: null,
            allowedAssetTypes: ['image', 'gif'],
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue: null },
        };
    },

    /**
     * A Sparrow atlas selector. Picks from the project's visual asset registry.
     * Only shows assets imported as Sparrow atlases (paired PNG + XML).
     * Default value is `null` (no asset selected).
     */
    sparrowAsset(key: string, label: string, opts?: CommonOpts): PropertyDefinition {
        return {
            key,
            type: 'assetRef',
            label,
            default: null,
            allowedAssetTypes: ['sparrow'],
            ...(opts?.description && { description: opts.description }),
            ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
            runtime: { transform: asTrimmedString, defaultValue: null },
        };
    },

    /**
     * Helpers for reusable multi-prop patterns.
     *
     * @example
     * properties: [
     *   ...prop.slot.colorOpacity('fill', 'Fill'),
     *   ...prop.slot.colorOpacity('stroke', 'Stroke', '#000000', { opacityDefault: 0 }),
     * ]
     */
    slot: {
        /**
         * Returns a `[color, opacity]` pair of `PropertyDefinition` objects for a named visual surface.
         *
         * Keys are derived from `keyPrefix`: `colorOpacity('bar', 'Bar')` → `barColor`, `barOpacity`.
         *
         * @param keyPrefix    Camel-case prefix for the generated keys (e.g. `'bar'`, `'barBg'`).
         * @param label        Human-readable surface name used in property labels (e.g. `'Bar'`).
         * @param defaultColor Hex color default (default: `'#ffffff'`).
         * @param opts         Optional overrides for opacity default, slider step, and visibility conditions.
         */
        colorOpacity(
            keyPrefix: string,
            label: string,
            defaultColor = '#ffffff',
            opts?: {
                opacityDefault?: number;
                step?: number;
                visibleWhen?: PropertyVisibilityCondition[];
            }
        ): PropertyDefinition[] {
            return [
                {
                    key: `${keyPrefix}Color`,
                    type: 'color',
                    label: `${label} Color`,
                    default: defaultColor,
                    ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
                    runtime: { transform: asTrimmedString, defaultValue: defaultColor },
                },
                {
                    key: `${keyPrefix}Opacity`,
                    type: 'range',
                    label: `${label} Opacity`,
                    default: opts?.opacityDefault ?? 1,
                    min: 0,
                    max: 1,
                    step: opts?.step ?? 0.01,
                    ...(opts?.visibleWhen && { visibleWhen: opts.visibleWhen }),
                    runtime: { transform: asNumber, defaultValue: opts?.opacityDefault ?? 1 },
                },
            ];
        },
    },
} as const;

// ─── insertElementGroups ─────────────────────────────────────────────────────

/**
 * Inserts plugin-specific property tabs into the base element schema.
 *
 * The result will be `[Transform tab, ...pluginTabs]`.
 *
 * @param base         The schema returned by `super.getConfigSchema()`.
 * @param overrides    Fields to override on the base schema (`name`, `description`, `category`).
 * @param pluginTabs   The property tabs specific to this element.
 */
export function insertElementGroups(
    base: EnhancedConfigSchema,
    overrides: Partial<Pick<EnhancedConfigSchema, 'name' | 'description' | 'category'>>,
    pluginTabs: PropertyTab[]
): EnhancedConfigSchema {
    return {
        ...base,
        ...overrides,
        tabs: [base.tabs[0], ...pluginTabs],
    };
}
