import { PluginContractError, type DiagnosticsApi, type PluginCapability } from './api.js';
import type { AudioApi, AudioCalculator, AudioCalculatorsApi } from './audio.js';
import type { AudioFeatureRequirement } from './audio.js';
import type { RenderObject, RenderTime } from './render.js';
import type { TimelineApi } from './timeline.js';
import type { TimingApi } from './timing.js';
import type { AssetApi } from './visual-assets.js';

export interface MidiUtilitiesApi {
    noteName(note: number): string;
}

export interface CapabilityContext {
    readonly timeline?: TimelineApi;
    readonly audio?: AudioApi;
    readonly timing?: TimingApi;
    readonly midi?: MidiUtilitiesApi;
    readonly audioCalculators?: AudioCalculatorsApi;
    readonly assets: AssetApi;
    readonly diagnostics: DiagnosticsApi;
    readonly signal: AbortSignal;
}

export interface ElementMetadata {
    readonly name: string;
    readonly description?: string;
    readonly category?: string;
}

export interface ElementCapabilities {
    readonly required?: readonly PluginCapability[];
    readonly optional?: readonly PluginCapability[];
}

/** Property kinds supported by the MVMNT element inspector. */
export type ElementPropertyType =
    | 'string'
    | 'longString'
    | 'number'
    | 'boolean'
    | 'color'
    | 'colorAlpha'
    | 'select'
    | 'range'
    | 'file'
    | 'file-midi'
    | 'file-image'
    | 'font'
    | 'timelineTrackRef'
    | 'audioAnalysisProfile'
    | 'assetRef';

export interface ElementPropertyOption<Value = unknown> {
    readonly value: Value;
    readonly label: string;
}

export type ElementPropertyVisibilityCondition = Readonly<{
    key: string;
    equals?: unknown;
    notEquals?: unknown;
    truthy?: boolean;
    falsy?: boolean;
}>;

export interface ElementPreset {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly thumbnail?: string;
    readonly values: Readonly<Record<string, unknown>>;
}

/**
 * Public, serializable inspector-property description.
 *
 * This deliberately describes UI data only. Runtime transforms remain a host
 * implementation detail and are not part of the plugin contract.
 */
export interface ElementPropertyDefinition<Type extends ElementPropertyType = ElementPropertyType> {
    readonly key: string;
    readonly type: Type;
    readonly label: string;
    readonly default?: unknown;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly options?: readonly ElementPropertyOption[];
    readonly accept?: string;
    readonly description?: string;
    readonly allowedAssetTypes?: readonly ('image' | 'gif' | 'sparrow')[];
    readonly allowedTrackTypes?: readonly ('midi' | 'audio')[];
    readonly trackPropertyKey?: string;
    readonly allowMultiple?: boolean;
    readonly glossaryTerms?: Readonly<{ featureDescriptor?: string; analysisProfile?: string }>;
    readonly visibleWhen?: readonly ElementPropertyVisibilityCondition[];
}

export interface ElementPropertyGroup {
    readonly id: string;
    readonly label: string;
    readonly collapsed: boolean;
    readonly description?: string;
    readonly properties: readonly ElementPropertyDefinition[];
    readonly presets?: readonly ElementPreset[];
}

export interface ElementPropertyTab {
    readonly id: string;
    readonly label: string;
    readonly groups: readonly ElementPropertyGroup[];
}

/** Runtime schema used to construct an element's inspector and property bag. */
export interface ElementSchema {
    readonly defaultConfig?: Readonly<Record<string, unknown>>;
    readonly tabs: readonly ElementPropertyTab[];
    readonly presets?: readonly ElementPreset[];
}

type CommonPropertyOptions = Readonly<{
    description?: string;
    visibleWhen?: readonly ElementPropertyVisibilityCondition[];
}>;
type NumericPropertyOptions = CommonPropertyOptions & Readonly<{ min?: number; max?: number; step?: number }>;
const property = (
    type: ElementPropertyType,
    key: string,
    label: string,
    defaultValue: unknown,
    options: Record<string, unknown> = {}
): ElementPropertyDefinition => Object.freeze({ key, type, label, default: defaultValue, ...options });
const choices = (values: readonly (string | ElementPropertyOption)[]): readonly ElementPropertyOption[] =>
    values.map((value) => (typeof value === 'string' ? { value, label: value } : value));

export const BLEND_MODE_CHOICES = Object.freeze(
    [
        'source-over',
        'screen',
        'multiply',
        'overlay',
        'darken',
        'lighten',
        'color-dodge',
        'color-burn',
        'hard-light',
        'soft-light',
        'difference',
        'exclusion',
        'hue',
        'saturation',
        'color',
        'luminosity',
    ].map((value) => ({ value, label: value === 'source-over' ? 'Normal' : value.replace('-', ' ') }))
);

/** Package-owned schema builders. They create serializable DTOs and never embed host runtime transforms. */
export const prop = Object.freeze({
    number: (key: string, label: string, value: number, options?: NumericPropertyOptions) =>
        property('number', key, label, value, options as Record<string, unknown>),
    range: (key: string, label: string, value: number, options?: NumericPropertyOptions) =>
        property('range', key, label, value, options as Record<string, unknown>),
    boolean: (key: string, label: string, value: boolean, options?: CommonPropertyOptions) =>
        property('boolean', key, label, value, options as Record<string, unknown>),
    string: (key: string, label: string, value: string, options?: CommonPropertyOptions) =>
        property('string', key, label, value, options as Record<string, unknown>),
    longString: (key: string, label: string, value: string, options?: CommonPropertyOptions) =>
        property('longString', key, label, value, options as Record<string, unknown>),
    color: (key: string, label: string, value: string, options?: CommonPropertyOptions) =>
        property('color', key, label, value, options as Record<string, unknown>),
    colorAlpha: (key: string, label: string, value: string, options?: CommonPropertyOptions) =>
        property('colorAlpha', key, label, value, options as Record<string, unknown>),
    font: (key: string, label: string, value: string, options?: CommonPropertyOptions) =>
        property('font', key, label, value, options as Record<string, unknown>),
    select: (
        key: string,
        label: string,
        value: unknown,
        values: readonly (string | ElementPropertyOption)[],
        options?: CommonPropertyOptions
    ) => property('select', key, label, value, { ...options, options: choices(values) }),
    midiTrack: (key: string, label: string, options?: CommonPropertyOptions & Readonly<{ allowMultiple?: boolean }>) =>
        property('timelineTrackRef', key, label, null, { ...options, allowedTrackTypes: ['midi'] }),
    audioTrack: (key: string, label: string, options?: CommonPropertyOptions & Readonly<{ allowMultiple?: boolean }>) =>
        property('timelineTrackRef', key, label, null, { ...options, allowedTrackTypes: ['audio'] }),
    imageAsset: (key: string, label: string, options?: CommonPropertyOptions) =>
        property('assetRef', key, label, null, { ...options, allowedAssetTypes: ['image', 'gif'] }),
    sparrowAsset: (key: string, label: string, options?: CommonPropertyOptions) =>
        property('assetRef', key, label, null, { ...options, allowedAssetTypes: ['sparrow'] }),
    file: (key: string, label: string, options?: CommonPropertyOptions & Readonly<{ accept?: string }>) =>
        property('file', key, label, null, options as Record<string, unknown>),
    blendMode: (key = 'blendMode', label = 'Blend Mode', options?: CommonPropertyOptions) =>
        property('select', key, label, 'source-over', { ...options, options: BLEND_MODE_CHOICES }),
});

const makeTab =
    (id: string, label: string) =>
    (groups: readonly ElementPropertyGroup[]): ElementPropertyTab => ({ id, label, groups });
export const tab = Object.freeze({
    transform: makeTab('transform', 'Transform'),
    content: makeTab('content', 'Content'),
    appearance: makeTab('appearance', 'Appearance'),
    animation: makeTab('animation', 'Animation'),
    advanced: makeTab('advanced', 'Advanced'),
    properties: makeTab('properties', 'Properties'),
    grid: makeTab('grid', 'Grid'),
    custom: (id: string, label: string, groups: readonly ElementPropertyGroup[]): ElementPropertyTab => ({
        id,
        label,
        groups,
    }),
});

export interface NamedElementSchema extends ElementSchema {
    readonly name: string;
    readonly description: string;
    readonly category?: string;
}

export function insertElementConfig(
    base: Partial<NamedElementSchema>,
    overrides: Partial<Pick<NamedElementSchema, 'name' | 'description' | 'category' | 'presets'>>,
    pluginTabs: readonly ElementPropertyTab[]
): NamedElementSchema {
    return {
        name: overrides.name ?? base.name ?? '',
        description: overrides.description ?? base.description ?? '',
        ...(base.category || overrides.category ? { category: overrides.category ?? base.category } : {}),
        ...(overrides.presets || base.presets ? { presets: overrides.presets ?? base.presets } : {}),
        tabs: [...(base.tabs?.slice(0, 1) ?? []), ...pluginTabs],
    };
}

export type EnhancedConfigSchema = NamedElementSchema;

/**
 * Callback-owned state helper for large renderers. It carries only callback props/context;
 * the host scene instance, stores, and global SDK accessors are never exposed.
 */
export abstract class CallbackElementRenderer {
    protected context!: CapabilityContext;
    private props: Readonly<Record<string, unknown>> = Object.freeze({ visible: true });
    private readonly pendingAssets: Array<(context: CapabilityContext) => void> = [];
    constructor(_type?: string, _id?: string | null, config: Record<string, unknown> = {}) {
        this.props = Object.freeze({ visible: true, ...config });
    }
    static getConfigSchema(): NamedElementSchema {
        return { name: '', description: '', tabs: [] };
    }
    __attach(context: CapabilityContext, props: Readonly<Record<string, unknown>>): void {
        this.context = context;
        this.__update(props);
        this.pendingAssets.splice(0).forEach((attach) => attach(context));
    }
    __update(props: Readonly<Record<string, unknown>>): void {
        this.props = Object.freeze({ visible: true, ...props });
    }
    __dispose(): void {
        this.onDestroy();
    }
    protected onDestroy(): void {}
    protected getProperty<T>(key: string): T {
        return this.props[key] as T;
    }
    protected getSchemaProps(): any {
        return this.props;
    }
    protected secondsToBeats(seconds: number): number {
        const result = this.context.timing?.secondsToBeats(seconds);
        return result?.ok ? result.value : 0;
    }
    protected secondsToTicks(seconds: number): number {
        const result = this.context.timing?.secondsToTicks(seconds);
        return result?.ok ? result.value : 0;
    }
    protected bundledImage(path: string): any {
        return this.lazyAsset((context) => context.assets.bundledImage(path));
    }
    protected bundledSprite(path: string): any {
        return this.bundledImage(path);
    }
    protected bundledSparrow(imagePath: string, xmlPath: string, fps?: number): any {
        return this.lazyAsset((context) => context.assets.bundledSparrow(imagePath, xmlPath, fps));
    }
    protected bundledGridAtlas(
        path: string,
        layout: Readonly<{ columns: number; rows: number; frameDurationMs?: number }>
    ): any {
        return this.lazyAsset((context) => context.assets.bundledGridAtlas(path, layout));
    }
    protected visualHandle(): any {
        return this.lazyAsset((context) => context.assets.project());
    }
    private lazyAsset(factory: (context: CapabilityContext) => any): any {
        let handle: any;
        this.pendingAssets.push((context) => {
            handle = factory(context);
        });
        return {
            get: () => handle?.get?.() ?? { resource: null, status: 'idle' },
            update: (id: string | null) => handle?.update?.(id) ?? { resource: null, status: 'idle' },
            destroy: () => handle?.dispose?.(),
            dispose: () => handle?.dispose?.(),
        };
    }
    abstract _buildRenderObjects(config: unknown, targetTime: number): readonly RenderObject[];
}

export function defineRendererElement(
    input: Readonly<{
        type: string;
        capabilities: ElementCapabilities;
        featureRequirements?: readonly AudioFeatureRequirement[];
        calculators?: readonly AudioCalculator[];
    }>,
    Renderer: (new (id?: string, config?: Record<string, unknown>) => CallbackElementRenderer) & {
        getConfigSchema(): NamedElementSchema;
    }
): PluginElementDefinition<Readonly<Record<string, unknown>>, CallbackElementRenderer, NamedElementSchema> {
    const schema = Renderer.getConfigSchema();
    return definePluginElement({
        type: input.type,
        metadata: { name: schema.name, description: schema.description, category: schema.category },
        schema,
        capabilities: input.capabilities,
        load(context) {
            for (const calculator of input.calculators ?? []) {
                const registered = context.audioCalculators?.register(calculator);
                if (!registered?.ok)
                    throw new PluginContractError(
                        registered?.error.message ?? `Unable to register calculator '${calculator.id}'`
                    );
            }
            if (input.featureRequirements?.length) {
                const result = context.audio?.requireFeatures(input.featureRequirements);
                if (!result?.ok)
                    throw new PluginContractError(
                        result?.error.message ?? 'audio.features.read is required for feature requirements'
                    );
            }
        },
        create(props, context) {
            const renderer = new Renderer(input.type, { ...props });
            renderer.__attach(context, props);
            return renderer;
        },
        render(props, renderer, time) {
            renderer.__update(props);
            return renderer._buildRenderObjects({}, time.seconds);
        },
        dispose(renderer) {
            renderer.__dispose();
        },
    });
}

type SchemaProperty<Schema extends ElementSchema> = Schema['tabs'][number]['groups'][number]['properties'][number];

type SelectValue<Property extends ElementPropertyDefinition> = Property extends {
    readonly options: readonly (infer Option)[];
}
    ? Option extends { readonly value: infer Value }
        ? Value
        : unknown
    : Property extends { readonly default: infer Value }
      ? Value
      : unknown;

/** The runtime value supplied to callbacks for one inspector property. */
export type ElementPropertyValue<Property extends ElementPropertyDefinition> = Property['type'] extends
    | 'number'
    | 'range'
    ? number
    : Property['type'] extends 'boolean'
      ? boolean
      : Property['type'] extends 'select'
        ? SelectValue<Property>
        : Property['type'] extends 'timelineTrackRef'
          ? Property extends { readonly allowMultiple: true }
              ? readonly string[] | null
              : string | null
          : Property['type'] extends 'file' | 'file-midi' | 'file-image' | 'assetRef' | 'audioAnalysisProfile'
            ? string | null
            : string;

/**
 * Derives the callback props from an element schema. Prefer this for normal
 * elements so the inspector schema is the single source of truth.
 */
export type PropsFromSchema<Schema extends ElementSchema> = Readonly<{
    [Property in SchemaProperty<Schema> as Property['key']]: ElementPropertyValue<Property>;
}>;

export interface PluginElementDefinition<
    Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
    State = undefined,
    Schema = unknown,
> {
    readonly kind: 'mvmnt.plugin-element.v2';
    readonly type: string;
    readonly metadata: ElementMetadata;
    readonly schema: Schema;
    readonly capabilities: ElementCapabilities;
    load?(context: CapabilityContext): void | Promise<void>;
    create?(props: Props, context: CapabilityContext): State | Promise<State>;
    render(props: Props, state: State, time: RenderTime, context: CapabilityContext): readonly RenderObject[];
    dispose?(state: State, context: CapabilityContext): void | Promise<void>;
    unload?(context: CapabilityContext): void | Promise<void>;
}

export type PluginElementDefinitionInput<
    Props extends Readonly<Record<string, unknown>>,
    State,
    Schema = unknown,
> = Omit<PluginElementDefinition<Props, State, Schema>, 'kind'>;

const validateCapabilities = (capabilities: ElementCapabilities): void => {
    const all = [...(capabilities.required ?? []), ...(capabilities.optional ?? [])];
    if (new Set(all).size !== all.length)
        throw new PluginContractError('Element capabilities must not contain duplicates');
};

export function definePluginElement<const Schema extends ElementSchema, State = undefined>(
    input: PluginElementDefinitionInput<PropsFromSchema<Schema>, State, Schema>
): PluginElementDefinition<PropsFromSchema<Schema>, State, Schema>;
/**
 * Compatibility overload for elements with props that cannot be represented by
 * an inspector schema. New elements normally omit this generic and infer props.
 */
export function definePluginElement<
    Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
    State = undefined,
    Schema = unknown,
>(input: PluginElementDefinitionInput<Props, State, Schema>): PluginElementDefinition<Props, State, Schema>;
export function definePluginElement(
    input: PluginElementDefinitionInput<Readonly<Record<string, unknown>>, unknown, unknown>
): PluginElementDefinition<Readonly<Record<string, unknown>>, unknown, unknown> {
    if (!input || typeof input !== 'object')
        throw new PluginContractError('definePluginElement() requires a definition object');
    // Camel-case remains valid for stable built-in type IDs created before SDK 2.
    if (!/^[a-z][a-zA-Z0-9-]*$/.test(input.type)) throw new PluginContractError(`Invalid element type: ${input.type}`);
    if (typeof input.render !== 'function')
        throw new PluginContractError(`Element '${input.type}' must define render()`);
    validateCapabilities(input.capabilities);
    return Object.freeze({ ...input, kind: 'mvmnt.plugin-element.v2' as const });
}

export function isPluginElementDefinition(value: unknown): value is PluginElementDefinition<any, any> {
    return Boolean(
        value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'mvmnt.plugin-element.v2'
    );
}
