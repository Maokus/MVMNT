import { PluginContractError, type DiagnosticsApi, type PluginCapability } from './api.js';
import type { AudioApi, AudioCalculatorsApi } from './audio.js';
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
  readonly visibleWhen?: readonly unknown[];
}

export interface ElementPropertyGroup {
  readonly id: string;
  readonly label: string;
  readonly collapsed: boolean;
  readonly description?: string;
  readonly properties: readonly ElementPropertyDefinition[];
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
  readonly presets?: readonly unknown[];
}

type SchemaProperty<Schema extends ElementSchema> =
  Schema['tabs'][number]['groups'][number]['properties'][number];

type SelectValue<Property extends ElementPropertyDefinition> =
  Property extends { readonly options: readonly (infer Option)[] }
    ? Option extends { readonly value: infer Value } ? Value : unknown
    : Property extends { readonly default: infer Value } ? Value : unknown;

/** The runtime value supplied to callbacks for one inspector property. */
export type ElementPropertyValue<Property extends ElementPropertyDefinition> =
  Property['type'] extends 'number' | 'range' ? number
    : Property['type'] extends 'boolean' ? boolean
      : Property['type'] extends 'select' ? SelectValue<Property>
        : Property['type'] extends 'timelineTrackRef'
          ? Property extends { readonly allowMultiple: true } ? readonly string[] | null : string | null
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

export interface PluginElementDefinition<Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>, State = undefined, Schema = unknown> {
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

export type PluginElementDefinitionInput<Props extends Readonly<Record<string, unknown>>, State, Schema = unknown> =
  Omit<PluginElementDefinition<Props, State, Schema>, 'kind'>;

const validateCapabilities = (capabilities: ElementCapabilities): void => {
  const all = [...(capabilities.required ?? []), ...(capabilities.optional ?? [])];
  if (new Set(all).size !== all.length) throw new PluginContractError('Element capabilities must not contain duplicates');
};

export function definePluginElement<const Schema extends ElementSchema, State = undefined>(
  input: PluginElementDefinitionInput<PropsFromSchema<Schema>, State, Schema>,
): PluginElementDefinition<PropsFromSchema<Schema>, State, Schema>;
/**
 * Compatibility overload for elements with props that cannot be represented by
 * an inspector schema. New elements normally omit this generic and infer props.
 */
export function definePluginElement<Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>, State = undefined, Schema = unknown>(
  input: PluginElementDefinitionInput<Props, State, Schema>,
): PluginElementDefinition<Props, State, Schema>;
export function definePluginElement(
  input: PluginElementDefinitionInput<Readonly<Record<string, unknown>>, unknown, unknown>,
): PluginElementDefinition<Readonly<Record<string, unknown>>, unknown, unknown> {
  if (!input || typeof input !== 'object') throw new PluginContractError('definePluginElement() requires a definition object');
  // Camel-case remains valid for stable built-in type IDs created before SDK 2.
  if (!/^[a-z][a-zA-Z0-9-]*$/.test(input.type)) throw new PluginContractError(`Invalid element type: ${input.type}`);
  if (typeof input.render !== 'function') throw new PluginContractError(`Element '${input.type}' must define render()`);
  validateCapabilities(input.capabilities);
  return Object.freeze({ ...input, kind: 'mvmnt.plugin-element.v2' as const });
}

export function isPluginElementDefinition(value: unknown): value is PluginElementDefinition<any, any> {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'mvmnt.plugin-element.v2');
}
