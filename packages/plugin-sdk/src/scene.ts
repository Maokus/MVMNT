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

export interface PluginElementDefinition<Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>, State = undefined> {
  readonly kind: 'mvmnt.plugin-element.v2';
  readonly type: string;
  readonly metadata: ElementMetadata;
  readonly schema: unknown;
  readonly capabilities: ElementCapabilities;
  load?(context: CapabilityContext): void | Promise<void>;
  create?(props: Props, context: CapabilityContext): State | Promise<State>;
  render(props: Props, state: State, time: RenderTime, context: CapabilityContext): readonly RenderObject[];
  dispose?(state: State, context: CapabilityContext): void | Promise<void>;
  unload?(context: CapabilityContext): void | Promise<void>;
}

export type PluginElementDefinitionInput<Props extends Readonly<Record<string, unknown>>, State> =
  Omit<PluginElementDefinition<Props, State>, 'kind'>;

const validateCapabilities = (capabilities: ElementCapabilities): void => {
  const all = [...(capabilities.required ?? []), ...(capabilities.optional ?? [])];
  if (new Set(all).size !== all.length) throw new PluginContractError('Element capabilities must not contain duplicates');
};

export function definePluginElement<Props extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>, State = undefined>(
  input: PluginElementDefinitionInput<Props, State>,
): PluginElementDefinition<Props, State> {
  if (!input || typeof input !== 'object') throw new PluginContractError('definePluginElement() requires a definition object');
  if (!/^[a-z][a-z0-9-]*$/.test(input.type)) throw new PluginContractError(`Invalid element type: ${input.type}`);
  if (typeof input.render !== 'function') throw new PluginContractError(`Element '${input.type}' must define render()`);
  validateCapabilities(input.capabilities);
  return Object.freeze({ ...input, kind: 'mvmnt.plugin-element.v2' as const });
}

export function isPluginElementDefinition(value: unknown): value is PluginElementDefinition<any, any> {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'mvmnt.plugin-element.v2');
}
