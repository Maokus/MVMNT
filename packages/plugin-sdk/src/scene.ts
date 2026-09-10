import { PluginContractError, type DiagnosticsApi, type PluginCapability, type Result } from './api.js';
import type { AudioApi, AudioCalculatorsApi, AudioFeatureDemand } from './audio.js';
import type { RenderObject, RenderTime } from './render.js';
import type { TimelineApi, MidiNoteEvent } from './timeline.js';
import type { TimingApi } from './timing.js';
import type { AssetApi } from './visual-assets.js';

export interface MidiUtilitiesApi {
    noteName(note: number): string;
}

/** Allocation-only context. Values returned by setup have no authored or temporal meaning. */
export interface ResourceContext {
    readonly audioCalculators?: AudioCalculatorsApi;
    readonly assets: AssetApi;
    readonly diagnostics: DiagnosticsApi;
    readonly signal: AbortSignal;
    /** Registers synchronous cleanup, including when initialization subsequently fails. */
    onCleanup(callback: () => undefined): void;
}

export interface CapabilityContext extends ResourceContext {
    readonly timeline?: TimelineApi;
    readonly audio?: AudioApi;
    readonly timing?: TimingApi;
    readonly midi?: MidiUtilitiesApi;
}

export type NumericPropertyKey<Props extends Readonly<Record<string, unknown>>> = {
    [Key in keyof Props]-?: Props[Key] extends number ? Key : never;
}[keyof Props];

export interface PropertyTimeRange {
    readonly startSeconds: number;
    readonly endSeconds: number;
}

export interface PropertyIntegrationOptions {
    /** Absolute error target. Defaults to 1e-6. */
    readonly absoluteTolerance?: number;
    /** Error target relative to the current area estimate. Defaults to 1e-4. */
    readonly relativeTolerance?: number;
    /** Hard sampling budget. Defaults to 2049 and may not exceed 16385. */
    readonly maxEvaluations?: number;
}

/** Instance-scoped access to effective property values without exposing their backing bindings. */
export interface ElementPropertyApi<Props extends Readonly<Record<string, unknown>>> {
    valueAt<Key extends keyof Props>(key: Key, timeSeconds: number): Result<Props[Key]>;
    /** Signed area in value-seconds for a numeric property. */
    integrate<Key extends NumericPropertyKey<Props>>(
        key: Key,
        range: PropertyTimeRange,
        options?: PropertyIntegrationOptions
    ): Result<number>;
    /** Time-weighted mean for a numeric property over a non-empty range. */
    average<Key extends NumericPropertyKey<Props>>(
        key: Key,
        range: PropertyTimeRange,
        options?: PropertyIntegrationOptions
    ): Result<number>;
}

/** Context for callbacks owned by one scene-element instance. */
export interface ElementContext<Props extends Readonly<Record<string, unknown>>> extends CapabilityContext {
    readonly properties: ElementPropertyApi<Props>;
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

export type ElementPropertyVisibilityCondition =
    | Readonly<{ key: string; equals: unknown }>
    | Readonly<{ key: string; notEquals: unknown }>
    | Readonly<{ key: string; truthy: true }>
    | Readonly<{ key: string; falsy: true }>;

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

/** Semantic ports supplied by a declarative property-layout control. */
export type ElementPropertyControlBindings<Ports extends string = string> = Readonly<Record<Ports, string>>;

export type ElementPropertyControlLayoutNode<Ports extends string = string> = Readonly<{
    kind: 'control';
    control: string;
    bindings: ElementPropertyControlBindings<Ports>;
    options?: Readonly<Record<string, unknown>>;
    visibleWhen?: readonly ElementPropertyVisibilityCondition[];
}>;

/** Serializable inspector composition metadata. It never becomes scene data. */
export type ElementPropertyLayoutNode =
    | Readonly<{ kind: 'property'; propertyKey: string }>
    | ElementPropertyControlLayoutNode
    | Readonly<{
          kind: 'section';
          id: string;
          label?: string;
          collapsed?: boolean;
          visibleWhen?: readonly ElementPropertyVisibilityCondition[];
          children: readonly ElementPropertyLayoutNode[];
      }>
    | Readonly<{
          kind: 'actions';
          visibleWhen?: readonly ElementPropertyVisibilityCondition[];
          actions: readonly Readonly<{ id: string; label: string; patch: Readonly<Record<string, unknown>> }>[];
      }>;

export interface ElementPropertyGroup {
    readonly id: string;
    readonly label: string;
    readonly collapsed?: boolean;
    readonly description?: string;
    readonly properties: readonly ElementPropertyDefinition[];
    readonly layout?: readonly ElementPropertyLayoutNode[];
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
const property = <const Type extends ElementPropertyType, const Key extends string, const Default>(
    type: Type,
    key: Key,
    label: string,
    defaultValue: Default,
    options: Record<string, unknown> = {}
): ElementPropertyDefinition<Type> & { readonly key: Key; readonly default: Default } =>
    Object.freeze({ key, type, label, default: defaultValue, ...options });
const choices = <const Values extends readonly (string | ElementPropertyOption)[]>(
    values: Values
): readonly ElementPropertyOption[] =>
    values.map((value) => (typeof value === 'string' ? { value, label: value } : value));

type ChoiceValue<Choice> = Choice extends string
    ? Choice
    : Choice extends ElementPropertyOption<infer Value>
      ? Value
      : never;

const selectProperty = <
    const Key extends string,
    const Default,
    const Values extends readonly (string | ElementPropertyOption)[],
>(
    key: Key,
    label: string,
    value: Default,
    values: Values,
    options?: CommonPropertyOptions
) =>
    property('select', key, label, value, {
        ...options,
        options: choices(values),
    }) as ElementPropertyDefinition<'select'> & {
        readonly key: Key;
        readonly default: Default;
        readonly options: readonly ElementPropertyOption<ChoiceValue<Values[number]>>[];
    };

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
    number<const Key extends string>(key: Key, label: string, value: number, options?: NumericPropertyOptions) {
        return property('number', key, label, value, options as Record<string, unknown>);
    },
    boolean<const Key extends string>(key: Key, label: string, value: boolean, options?: CommonPropertyOptions) {
        return property('boolean', key, label, value, options as Record<string, unknown>);
    },
    string<const Key extends string>(key: Key, label: string, value: string, options?: CommonPropertyOptions) {
        return property('string', key, label, value, options as Record<string, unknown>);
    },
    longString<const Key extends string>(key: Key, label: string, value: string, options?: CommonPropertyOptions) {
        return property('longString', key, label, value, options as Record<string, unknown>);
    },
    color<const Key extends string>(key: Key, label: string, value: string, options?: CommonPropertyOptions) {
        return property('color', key, label, value, options as Record<string, unknown>);
    },
    colorAlpha<const Key extends string>(key: Key, label: string, value: string, options?: CommonPropertyOptions) {
        return property('colorAlpha', key, label, value, options as Record<string, unknown>);
    },
    font<const Key extends string>(key: Key, label: string, value: string, options?: CommonPropertyOptions) {
        return property('font', key, label, value, options as Record<string, unknown>);
    },
    select: selectProperty,
    midiTrack<const Key extends string>(key: Key, label: string, options?: CommonPropertyOptions) {
        return property('timelineTrackRef', key, label, null, { ...options, allowedTrackTypes: ['midi'] });
    },
    audioTrack<const Key extends string>(key: Key, label: string, options?: CommonPropertyOptions) {
        return property('timelineTrackRef', key, label, null, { ...options, allowedTrackTypes: ['audio'] });
    },
    imageAsset<const Key extends string>(key: Key, label: string, options?: CommonPropertyOptions) {
        return property('assetRef', key, label, null, { ...options, allowedAssetTypes: ['image', 'gif'] });
    },
    sparrowAsset<const Key extends string>(key: Key, label: string, options?: CommonPropertyOptions) {
        return property('assetRef', key, label, null, { ...options, allowedAssetTypes: ['sparrow'] });
    },
    file<const Key extends string>(
        key: Key,
        label: string,
        options?: CommonPropertyOptions & Readonly<{ accept?: string }>
    ) {
        return property('file', key, label, null, options as Record<string, unknown>);
    },
    blendMode<const Key extends string = 'blendMode'>(
        key: Key = 'blendMode' as Key,
        label = 'Blend Mode',
        options?: CommonPropertyOptions
    ) {
        return selectProperty(key, label, 'source-over', BLEND_MODE_CHOICES, options);
    },
});

const makeTab =
    (id: string, label: string) =>
    <const Groups extends readonly ElementPropertyGroup[]>(
        groups: Groups
    ): ElementPropertyTab & { readonly groups: Groups } => ({ id, label, groups });
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

export type ElementPropertyGroupOptions = Readonly<
    Pick<ElementPropertyGroup, 'description' | 'layout' | 'presets'> & { collapsed?: boolean }
>;

/** Creates a serializable inspector group while preserving literal property keys for props inference. */
export function group<const Properties extends readonly ElementPropertyDefinition[]>(
    id: string,
    label: string,
    properties: Properties,
    options: ElementPropertyGroupOptions = {}
): ElementPropertyGroup & { readonly properties: Properties } {
    return Object.freeze({ id, label, properties, ...options, collapsed: options.collapsed ?? false });
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
export type ElementPropertyValue<Property extends ElementPropertyDefinition> = Property['type'] extends 'number'
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

/** One random-access frame. Resources may change cost, but must not encode render history. */
export type SimulationContext<Props extends Readonly<Record<string, unknown>>> = Readonly<
    Pick<ElementContext<Props>, 'properties' | 'timeline' | 'audio' | 'timing' | 'midi'>
> & {
    /** Note onsets in this step's half-open interval, not all overlapping sustained notes. */
    noteOns(trackIds?: readonly string[]): Result<readonly MidiNoteEvent[]>;
};

export interface SimulationSnapshot<State> {
    readonly state: Readonly<State>;
    readonly stepIndex: number;
    readonly timeSeconds: number;
}

export interface ElementSimulation<Props extends Readonly<Record<string, unknown>>, State> {
    /** Canonical fixed step, independent of playback and export frame rate. Defaults to 1/120 second. */
    readonly stepSeconds?: number;
    initialize(input: Readonly<{ props: Props; seed: number }>): State;
    step(
        input: Readonly<{
            state: Readonly<NoInfer<State>>;
            props: Props;
            time: Readonly<{ seconds: number; stepIndex: number }>;
            deltaSeconds: number;
            context: SimulationContext<Props>;
        }>
    ): NoInfer<State>;
}

export interface RenderInput<
    Props extends Readonly<Record<string, unknown>>,
    Resources = undefined,
    State = undefined,
> {
    readonly props: Props;
    readonly time: RenderTime;
    readonly context: ElementContext<Props>;
    readonly resources: Resources;
    readonly simulation: State extends undefined ? undefined : SimulationSnapshot<State>;
}

export interface PluginElementDefinition<
    Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
    Resources = undefined,
    Schema = unknown,
    State = undefined,
> {
    readonly kind: 'mvmnt.plugin-element.v2';
    readonly type: string;
    readonly metadata: ElementMetadata;
    readonly schema: Schema;
    readonly simulation?: ElementSimulation<Props, State>;
    /** Declaratively describes every analyzed audio artifact required by this instance. */
    audioFeatureDemands?(props: Props): readonly AudioFeatureDemand[];
    load?(context: ResourceContext): void | Promise<void>;
    /** Creates ephemeral runtime resources and caches retained for one element instance. */
    createResources?(context: ResourceContext): Resources | Promise<Resources>;
    /**
     * Produces one random-access frame. Resources may cache reusable work, but output must not depend on
     * the order or number of previous render calls.
     */
    render(input: RenderInput<Props, NoInfer<Resources>, NoInfer<State>>): readonly RenderObject[];
    /** Releases plugin-owned instance resources synchronously. Asynchronous work stops through context.signal. */
    disposeResources?(resources: NoInfer<Resources>, context: ResourceContext): undefined;
    unload?(context: ResourceContext): void | Promise<void>;
}

export type PluginElementDefinitionInput<
    Props extends Readonly<Record<string, unknown>>,
    Resources,
    Schema = unknown,
    State = undefined,
> = Omit<PluginElementDefinition<Props, Resources, Schema, State>, 'kind' | 'createResources' | 'disposeResources'> &
    (
        | {
              createResources(context: ResourceContext): Resources | Promise<Resources>;
              disposeResources?(resources: NoInfer<Resources>, context: ResourceContext): undefined;
          }
        | ([Resources] extends [undefined] ? { createResources?: never; disposeResources?: never } : never)
    );

export function definePluginElement<const Schema extends ElementSchema, Resources = undefined, State = undefined>(
    input: PluginElementDefinitionInput<PropsFromSchema<Schema>, Resources, Schema, State>
): PluginElementDefinition<PropsFromSchema<Schema>, Resources, Schema, State>;
/**
 * Explicit props for engine-owned schemas. External plugins normally infer props from builders.
 */
export function definePluginElement<
    Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
    Resources = undefined,
    Schema = unknown,
    State = undefined,
>(
    input: PluginElementDefinitionInput<Props, Resources, Schema, State>
): PluginElementDefinition<Props, Resources, Schema, State>;
export function definePluginElement(
    input: Omit<PluginElementDefinition<any, any, any, any>, 'kind'>
): PluginElementDefinition<any, any, any, any> {
    if (!input || typeof input !== 'object')
        throw new PluginContractError('definePluginElement() requires a definition object');
    // Camel-case remains valid for stable built-in type IDs created before SDK 2.
    if (!/^[a-z][a-zA-Z0-9-]*$/.test(input.type)) throw new PluginContractError(`Invalid element type: ${input.type}`);
    if (typeof input.render !== 'function')
        throw new PluginContractError(`Element '${input.type}' must define render()`);
    if ('create' in input || 'dispose' in input)
        throw new PluginContractError(`Element '${input.type}' must use createResources/disposeResources`);
    for (const key of ['createResources', 'disposeResources', 'load', 'unload'] as const) {
        if (input[key] !== undefined && typeof input[key] !== 'function')
            throw new PluginContractError(`Element '${input.type}' ${key} must be a function`);
    }
    if (input.disposeResources && !input.createResources)
        throw new PluginContractError(`Element '${input.type}' disposeResources requires createResources`);
    if (input.simulation !== undefined) {
        const simulation = input.simulation;
        if (!simulation || typeof simulation.initialize !== 'function' || typeof simulation.step !== 'function')
            throw new PluginContractError('simulation requires initialize() and step()');
        const dt = simulation.stepSeconds ?? 1 / 120;
        if (!Number.isFinite(dt) || dt <= 0)
            throw new PluginContractError('simulation.stepSeconds must be finite and positive');
        const seed = input.schema?.tabs
            ?.flatMap((tab: any) => tab.groups ?? [])
            .flatMap((group: any) => group.properties ?? [])
            .find((property: any) => property.key === 'seed');
        if (seed?.type !== 'number')
            throw new PluginContractError('simulation requires a numeric seed schema property');
    }
    return Object.freeze({ ...input, kind: 'mvmnt.plugin-element.v2' as const });
}

export function isPluginElementDefinition(value: unknown): value is PluginElementDefinition<any, any, any, any> {
    return Boolean(
        value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'mvmnt.plugin-element.v2'
    );
}
