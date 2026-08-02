import { type StateCreator } from 'zustand';
import { createWithEqualityFn } from 'zustand/traditional';
import type { Macro } from '@state/scene/macros';
import type { PropertyBindingData } from '@bindings/property-bindings';
import type { FontAsset } from '@state/scene/fonts';
import type {
    AutomationState,
    AutomationChannel,
    AutomationKeyframe,
    KeyframesBindingState,
    PropertyTarget,
} from '@automation/types';
import {
    createEmptyAutomationState,
    cloneChannel,
    elementPropertyTarget,
    encodePropertyTarget,
    migrateLegacyAutomationState,
    rebuildAutomationTargetIndex,
} from '@automation/types';
import { automationEvaluator } from '@automation/automation-evaluator';
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { useTimelineStore } from '@state/timelineStore';
import {
    migrateDescriptorChannels,
    buildChannelSelectorMap,
    type MigratedDescriptorChannelSelector,
    type MigratedDescriptorChannelsResult,
} from '@persistence/migrations/unifyChannelField';
import {
    logSmoothingMigration,
    stripDescriptorArraySmoothing,
    stripDescriptorSmoothing,
} from '@persistence/migrations/removeSmoothingFromDescriptor';
import { migrateSceneAudioSystemV5 } from '@persistence/migrations/audioSystemV5';
import { useSelectionStore } from '@state/selectionStore';
import {
    buildSceneGraphIndexes,
    cloneSceneGraph,
    createFlatSceneGraph,
    createNodeBase,
    deriveElementOrder,
    elementNodeId,
    validateSceneGraph,
    type NodeTransform,
    type SceneGraphState,
} from '@state/scene-graph';

export type BindingState = ConstantBindingState | MacroBindingState | KeyframesBindingState;

export interface ConstantBindingState {
    type: 'constant';
    value: unknown;
}

export interface MacroBindingState {
    type: 'macro';
    macroId: string;
}

export type ElementBindings = Record<string, BindingState>;

interface LegacyAudioFeatureBindingData {
    type: 'audioFeature';
    trackId?: string;
    featureKey?: string;
    calculatorId?: string | null;
    bandIndex?: number | null;
    smoothing?: number | null;
}

interface LegacyDescriptorResult {
    descriptor: AudioFeatureDescriptor | null;
    smoothing: number | null;
}

function applyChannelSelectorsToBindings(bindings: ElementBindings, results: MigratedDescriptorChannelsResult[]) {
    if (!Array.isArray(results) || !results.length) {
        return;
    }
    const selectorMap = buildChannelSelectorMap(results);
    if (!selectorMap || Object.keys(selectorMap).length === 0) {
        return;
    }
    const existing = bindings.channelSelectors;
    if (existing && existing.type === 'constant' && existing.value && typeof existing.value === 'object') {
        const merged = {
            ...((existing.value as Record<string, MigratedDescriptorChannelSelector>) ?? {}),
            ...selectorMap,
        };
        bindings.channelSelectors = { type: 'constant', value: merged };
        return;
    }
    bindings.channelSelectors = { type: 'constant', value: selectorMap };
}

function isLegacyAudioFeatureBinding(value: unknown): value is LegacyAudioFeatureBindingData {
    return Boolean(value && typeof value === 'object' && (value as { type?: string }).type === 'audioFeature');
}

function sanitizeLegacyDescriptor(payload: LegacyAudioFeatureBindingData): LegacyDescriptorResult {
    const featureKey = typeof payload.featureKey === 'string' && payload.featureKey ? payload.featureKey : null;
    if (!featureKey) return { descriptor: null, smoothing: null };
    const coerceIndex = (input: unknown): number | null =>
        typeof input === 'number' && Number.isFinite(input) ? input : null;
    const calculatorId = typeof payload.calculatorId === 'string' && payload.calculatorId ? payload.calculatorId : null;
    const smoothing =
        typeof payload.smoothing === 'number' && Number.isFinite(payload.smoothing) ? payload.smoothing : null;
    const { descriptor } = createFeatureDescriptor({
        feature: featureKey,
        calculatorId,
        bandIndex: coerceIndex(payload.bandIndex),
    });
    return { descriptor, smoothing };
}

export interface LegacyBindingMigrationResult {
    clearedKeys: string[];
    replacements: Record<string, BindingState>;
}

export function migrateLegacyAudioFeatureBinding(
    propertyKey: string,
    value: unknown
): LegacyBindingMigrationResult | null {
    if (propertyKey === 'featureDescriptor') {
        const replacements: Record<string, BindingState> = {};
        if ((value as ConstantBindingState | MacroBindingState | undefined)?.type === 'constant') {
            const descriptorValue = (value as ConstantBindingState).value;
            const { descriptor: stripped, smoothing } = stripDescriptorSmoothing(descriptorValue);
            let normalized: AudioFeatureDescriptor | null = null;
            if (stripped && typeof stripped.featureKey === 'string' && stripped.featureKey) {
                normalized = createFeatureDescriptor({
                    feature: stripped.featureKey,
                    calculatorId: (stripped.calculatorId as string | null | undefined) ?? null,
                    bandIndex:
                        typeof stripped.bandIndex === 'number' && Number.isFinite(stripped.bandIndex)
                            ? Math.trunc(stripped.bandIndex)
                            : null,
                }).descriptor;
            }
            replacements.features = {
                type: 'constant',
                value: normalized ? [normalized] : [],
            };
            replacements.analysisProfileId = { type: 'constant', value: 'default' };
            if (smoothing != null) {
                replacements.smoothing = { type: 'constant', value: normalizeSmoothingValue(smoothing) };
            }
        }
        return { clearedKeys: ['featureDescriptor'], replacements };
    }
    if (propertyKey !== 'featureBinding') return null;
    const clearedKeys = ['featureBinding', 'audioTrackId', 'featureDescriptor', 'analysisProfileId'];
    if (!isLegacyAudioFeatureBinding(value)) {
        return { clearedKeys, replacements: {} };
    }
    const replacements: Record<string, BindingState> = {};
    const trackId = typeof value.trackId === 'string' && value.trackId ? value.trackId : null;
    if (trackId) {
        replacements.audioTrackId = { type: 'constant', value: trackId };
    }
    const { descriptor, smoothing } = sanitizeLegacyDescriptor(value);
    if (descriptor) {
        replacements.features = { type: 'constant', value: [descriptor] };
        replacements.analysisProfileId = { type: 'constant', value: 'default' };
    }
    if (smoothing != null) {
        replacements.smoothing = { type: 'constant', value: normalizeSmoothingValue(smoothing) };
    }
    return { clearedKeys, replacements };
}

export interface MacroBindingAssignment {
    elementId: string;
    propertyPath: string;
}

export type MacroBindingsIndex = Record<string, MacroBindingAssignment[]>;
export interface MacroTargetAssignment {
    target: PropertyTarget;
}

export interface SceneSettingsState {
    fps: number;
    width: number;
    height: number;
    tempo: number;
    beatsPerBar: number;
    [key: string]: unknown;
}

export interface SceneElementRecord {
    id: string;
    type: string;
    createdAt: number;
    createdBy?: string;
}

export interface SceneInteractionState {
    hoveredElementId: string | null;
    editingElementId: string | null;
    clipboard: SceneClipboard | null;
    /** Element IDs expanded in the timeline automation section. */
    automationExpandedElements: string[];
    /** Channel IDs with curve editor pane open. */
    automationExpandedCurves: string[];
    /** Current search query for filtering automation properties. */
    automationSearchQuery: string;
    /** Collapsed state of property groups in the properties panel, keyed by elementId then groupId. */
    expandedPropertyGroups: Record<string, Record<string, boolean>>;
    /** Active property tab per element in the properties panel, keyed by elementId. */
    activePropertyTab: Record<string, string>;
    propertyClipboard: PropertyClipboard | null;
}

export interface SceneClipboard {
    exportedAt: number;
    elementIds: string[];
}

export interface PropertyClipboard {
    elementType: string;
    values: Record<string, any>;
}

export interface SceneMacroState {
    byId: Record<string, Macro>;
    allIds: string[];
    exportedAt?: number;
}

export interface SceneRuntimeMeta {
    schemaVersion: number;
    initializedAt: number;
    lastHydratedAt?: number;
    lastMutationSource?: SceneMutationSource;
    lastMutatedAt?: number;
    persistentDirty: boolean;
    hasInitializedScene: boolean;
}

export type SceneMutationSource =
    | 'addElement'
    | 'moveElement'
    | 'duplicateElement'
    | 'removeElement'
    | 'updateElementId'
    | 'updateBindings'
    | 'updateSettings'
    | 'updateMacros'
    | 'updateFonts'
    | 'clearScene'
    | 'updateAutomation'
    | 'replaceGraph'
    | 'updateNodeTransform'
    | 'setNodeVisibility'
    | 'setNodeLocked'
    | 'importScene';

export interface SceneBindingsState {
    byElement: Record<string, ElementBindings>;
    byMacro: MacroBindingsIndex;
    byTargetMacro?: Record<string, MacroTargetAssignment[]>;
}

export interface SceneFontsState {
    assets: Record<string, FontAsset>;
    order: string[];
    totalBytes: number;
    licensingAcknowledgedAt?: number;
}

export interface SceneStoreComputedExport {
    elements: Record<string, SceneSerializedElement>;
    elementsOrder: string[];
    graph: SceneGraphState;
    elementErrors?: Array<{ id: string; type: string; message: string }>;
    sceneSettings: SceneSettingsState;
    macros?: SceneSerializedMacros;
    fontAssets?: Record<string, FontAsset>;
    fontLicensingAcknowledgedAt?: number;
    automation?: AutomationState;
    nodeBindings?: Record<string, ElementBindings>;
}

export interface SceneSerializedElement {
    id: string;
    type: string;
    properties: Record<string, PropertyBindingData>;
}

export interface SceneSerializedMacros {
    macros: Record<string, Macro>;
    allIds?: string[];
    exportedAt?: number;
}

export interface SceneMacroDefinition {
    type: Macro['type'];
    value: unknown;
    defaultValue?: unknown;
    options?: Macro['options'];
}

export interface SceneImportPayload {
    elements?: SceneSerializedElement[] | Record<string, SceneSerializedElement>;
    elementsOrder?: string[];
    graph?: SceneGraphState;
    sceneSettings?: Partial<SceneSettingsState> | null;
    macros?: SceneSerializedMacros | null;
    fontAssets?: Record<string, FontAsset> | null;
    fontLicensingAcknowledgedAt?: number | null;
    automation?: AutomationState | null;
    nodeBindings?: Record<string, ElementBindings> | null;
}

export interface SceneElementInput {
    id: string;
    type: string;
    index?: number;
    createdBy?: string;
    createdAt?: number;
    bindings?: ElementBindings;
}

export type ElementBindingsPatch = Record<string, BindingState | null | undefined>;

export interface SceneStoreActions {
    addElement: (input: SceneElementInput) => void;
    moveElement: (elementId: string, targetIndex: number) => void;
    duplicateElement: (sourceId: string, newId: string, opts?: { insertAfter?: boolean }) => void;
    removeElement: (elementId: string) => void;
    updateElementId: (currentId: string, nextId: string) => void;
    updateSettings: (patch: Partial<SceneSettingsState>) => void;
    updateBindings: (elementId: string, patch: ElementBindingsPatch) => void;
    updateNodeBindings: (nodeId: string, patch: ElementBindingsPatch) => void;
    removeNodeBindings: (nodeIds: string[]) => void;
    createMacro: (macroId: string, definition: SceneMacroDefinition) => void;
    updateMacroValue: (macroId: string, value: unknown) => void;
    renameMacro: (currentId: string, nextId: string) => void;
    reorderMacros: (order: string[]) => void;
    deleteMacro: (macroId: string) => void;
    registerFontAsset: (asset: FontAsset) => void;
    updateFontAsset: (assetId: string, patch: Partial<Omit<FontAsset, 'id'>>) => void;
    deleteFontAsset: (assetId: string) => void;
    acknowledgeFontLicensing: (timestamp?: number) => void;
    clearScene: () => void;
    importScene: (payload: SceneImportPayload) => void;
    exportSceneDraft: () => SceneStoreComputedExport;
    replaceMacros: (payload: SceneSerializedMacros | null | undefined) => void;
    setInteractionState: (patch: Partial<SceneInteractionState>) => void;
    setPropertyGroupCollapseState: (elementId: string, groupId: string, collapsed: boolean) => void;
    setActivePropertyTab: (elementId: string, tabId: string) => void;
    setPropertyClipboard: (clipboard: PropertyClipboard | null) => void;
    setAutomationChannel: (channel: AutomationChannel) => void;
    removeAutomationChannel: (channelId: string) => void;
    updateAutomationKeyframes: (channelId: string, keyframes: AutomationKeyframe[]) => void;
    /** Set a transient per-property override (Blender-style delink when auto key is off). */
    setPropertyOverride: (channelId: string, value: unknown) => void;
    /** Clear a single transient property override (e.g. after manually keying a delinked property). */
    clearPropertyOverride: (channelId: string) => void;
    /** Clear all transient property overrides (called when playhead moves or playback starts). */
    clearAllPropertyOverrides: () => void;
    replaceGraph: (graph: SceneGraphState) => void;
    updateNodeTransform: (nodeId: string, transform: Partial<NodeTransform>) => void;
    setNodeVisibility: (nodeId: string, visible: boolean) => void;
    setNodeLocked: (nodeId: string, locked: boolean) => void;
    setNodeName: (nodeId: string, name: string) => void;
}

export interface SceneStoreState extends SceneStoreActions {
    settings: SceneSettingsState;
    elements: Record<string, SceneElementRecord>;
    order: string[];
    graph: SceneGraphState;
    nodeIdByElementId: Record<string, string>;
    elementIdByNodeId: Record<string, string>;
    bindings: SceneBindingsState;
    macros: SceneMacroState;
    fonts: SceneFontsState;
    interaction: SceneInteractionState;
    runtimeMeta: SceneRuntimeMeta;
    automation: AutomationState;
    /** Host node-property bindings keyed by stable node ID. */
    nodeBindings: Record<string, ElementBindings>;
    /** Transient per-channel value overrides. Populated when auto key is off and user changes
     *  a keyframed property. Cleared when the playhead moves. Does not affect saved state. */
    propertyOverrides: Record<string, unknown>;
}

const INTERNAL_SCENE_STORE_SCHEMA_VERSION = 6;

export const DEFAULT_SCENE_SETTINGS: SceneSettingsState = {
    fps: 60,
    width: 1500,
    height: 1500,
    tempo: 120,
    beatsPerBar: 4,
};

function createInitialInteractionState(): SceneInteractionState {
    return {
        hoveredElementId: null,
        editingElementId: null,
        clipboard: null,
        automationExpandedElements: [],
        automationExpandedCurves: [],
        automationSearchQuery: '',
        expandedPropertyGroups: {},
        activePropertyTab: {},
        propertyClipboard: null,
    };
}

function createEmptyBindingsState(): SceneBindingsState {
    return { byElement: {}, byMacro: {}, byTargetMacro: {} };
}

function cloneBinding(binding: BindingState): BindingState {
    if (binding.type === 'constant') {
        return { type: 'constant', value: binding.value };
    }
    if (binding.type === 'macro') {
        return { type: 'macro', macroId: binding.macroId };
    }
    if (binding.type === 'keyframes') {
        return { type: 'keyframes', channelId: binding.channelId };
    }
    throw new Error(`Unsupported binding type: ${(binding as { type?: string }).type ?? 'unknown'}`);
}

function hasAudioFeatureDescriptors(binding: ConstantBindingState): boolean {
    const value = binding.value;
    if (!Array.isArray(value)) return false;
    return value.some((descriptor) => {
        if (!descriptor || typeof descriptor !== 'object') return false;
        const key = (descriptor as { featureKey?: unknown }).featureKey;
        return typeof key === 'string' && key.length > 0;
    });
}

function ensureDefaultAnalysisProfileBinding(bindings: ElementBindings): boolean {
    const featuresBinding = bindings.features;
    if (!featuresBinding || featuresBinding.type !== 'constant') return false;
    if (!hasAudioFeatureDescriptors(featuresBinding)) return false;

    const profileBinding = bindings.analysisProfileId;
    if (profileBinding) {
        if (profileBinding.type === 'macro') return false;
        if (
            profileBinding.type === 'constant' &&
            typeof profileBinding.value === 'string' &&
            profileBinding.value.trim().length > 0
        ) {
            return false;
        }
    }

    bindings.analysisProfileId = { type: 'constant', value: 'default' };
    return true;
}

function cloneBindingsMap(bindings: ElementBindings, elementType?: string): ElementBindings {
    const smoothingKey = resolveSmoothingProperty(elementType);
    const result: ElementBindings = {};
    let migratedSmoothing: number | null = null;
    for (const [key, binding] of Object.entries(bindings)) {
        if (binding.type === 'constant' && key === 'features') {
            const value = binding.value;
            if (Array.isArray(value)) {
                const { descriptors, smoothingValues } = stripDescriptorArraySmoothing(value);
                if (smoothingValues.length && migratedSmoothing == null) {
                    migratedSmoothing = smoothingValues[0] ?? null;
                }
                const sanitized = descriptors.filter(
                    (entry): entry is Record<string, unknown> & { featureKey: string } =>
                        Boolean(
                            entry &&
                            typeof entry === 'object' &&
                            typeof (entry as { featureKey?: unknown }).featureKey === 'string'
                        )
                ) as AudioFeatureDescriptor[];
                result.features = {
                    type: 'constant',
                    value: sanitized,
                } as ConstantBindingState;
                continue;
            }
            const { descriptor, smoothing } = stripDescriptorSmoothing(value);
            if (smoothing != null && migratedSmoothing == null) {
                migratedSmoothing = smoothing;
            }
            const validDescriptor =
                descriptor && typeof (descriptor as { featureKey?: unknown }).featureKey === 'string'
                    ? (descriptor as unknown as AudioFeatureDescriptor)
                    : null;
            result.features = {
                type: 'constant',
                value: validDescriptor ? [validDescriptor] : [],
            } as ConstantBindingState;
            continue;
        }
        if (binding.type === 'constant' && smoothingKey && key === smoothingKey) {
            result[key] = {
                type: 'constant',
                value: normalizeSmoothingValue(binding.value),
            };
            continue;
        }
        result[key] = cloneBinding(binding);
    }
    if (migratedSmoothing != null) {
        if (smoothingKey && !result[smoothingKey]) {
            result[smoothingKey] = {
                type: 'constant',
                value: normalizeSmoothingValue(migratedSmoothing),
            };
        }
    }
    ensureDefaultAnalysisProfileBinding(result);
    return result;
}

function cloneFontAsset(asset: FontAsset): FontAsset {
    return {
        ...asset,
        variants: Array.isArray(asset.variants)
            ? asset.variants.map((variant) => ({
                  ...variant,
                  variationSettings: variant.variationSettings ? { ...variant.variationSettings } : undefined,
              }))
            : [],
    };
}

function computeFontBytes(assets: Record<string, FontAsset>): number {
    return Object.values(assets).reduce((total, asset) => {
        if (!asset) return total;
        const size = typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : 0;
        return total + size;
    }, 0);
}

function normalizeFontAssetInput(input: FontAsset, existing?: FontAsset): FontAsset {
    const now = Date.now();
    const createdAt = existing?.createdAt ?? input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    const licensingAcknowledged =
        typeof input.licensingAcknowledged === 'boolean'
            ? input.licensingAcknowledged
            : (existing?.licensingAcknowledged ?? false);
    return cloneFontAsset({
        ...existing,
        ...input,
        createdAt,
        updatedAt,
        licensingAcknowledged,
    });
}

function rebuildMacroIndex(byElement: Record<string, ElementBindings>): MacroBindingsIndex {
    const byMacro: MacroBindingsIndex = {};
    for (const [elementId, bindings] of Object.entries(byElement)) {
        for (const [propertyPath, binding] of Object.entries(bindings)) {
            if (binding.type !== 'macro') continue;
            if (!byMacro[binding.macroId]) byMacro[binding.macroId] = [];
            byMacro[binding.macroId].push({ elementId, propertyPath });
        }
    }
    for (const assignments of Object.values(byMacro)) {
        assignments.sort((a, b) => {
            if (a.elementId === b.elementId) return a.propertyPath.localeCompare(b.propertyPath);
            return a.elementId.localeCompare(b.elementId);
        });
    }
    return byMacro;
}

function rebuildTargetMacroIndex(
    byElement: Record<string, ElementBindings>,
    byNode: Record<string, ElementBindings>
): Record<string, MacroTargetAssignment[]> {
    const result: Record<string, MacroTargetAssignment[]> = {};
    const append = (macroId: string, target: PropertyTarget) => {
        (result[macroId] ??= []).push({ target });
    };
    for (const [elementId, bindings] of Object.entries(byElement)) {
        for (const [propertyPath, binding] of Object.entries(bindings)) {
            if (binding.type === 'macro') append(binding.macroId, elementPropertyTarget(elementId, propertyPath));
        }
    }
    for (const [nodeId, bindings] of Object.entries(byNode)) {
        for (const [propertyPath, binding] of Object.entries(bindings)) {
            if (binding.type === 'macro')
                append(binding.macroId, { owner: { kind: 'node', id: nodeId }, propertyPath });
        }
    }
    for (const assignments of Object.values(result)) {
        assignments.sort((left, right) =>
            encodePropertyTarget(left.target).localeCompare(encodePropertyTarget(right.target))
        );
    }
    return result;
}

function bindingEquals(a: BindingState, b: BindingState): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'constant' && b.type === 'constant') return Object.is(a.value, b.value);
    if (a.type === 'macro' && b.type === 'macro') return a.macroId === b.macroId;
    if (a.type === 'keyframes' && b.type === 'keyframes') return a.channelId === b.channelId;
    return false;
}

function resolveSmoothingProperty(elementType: string | undefined): string | null {
    switch (elementType) {
        case 'audioSpectrum':
        case 'audioVolumeMeter':
        case 'audioWaveform':
        case 'audioOscilloscope':
            return 'smoothing';
        default:
            return null;
    }
}

function normalizeSmoothingValue(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, numeric);
}

export function deserializeElementBindings(raw: SceneSerializedElement): ElementBindings {
    const bindings: ElementBindings = {};
    let migratedSmoothing: number | null = null;
    // Support both V6 (nested `properties`) and V5 (flat top-level) formats.
    const propertiesSource =
        raw.properties != null && typeof raw.properties === 'object' && !Array.isArray(raw.properties)
            ? raw.properties
            : Object.fromEntries(
                  Object.entries(raw as unknown as Record<string, unknown>).filter(([k]) => k !== 'id' && k !== 'type')
              );
    for (const [key, value] of Object.entries(propertiesSource)) {
        if (!value || typeof value !== 'object') continue;
        const payload = value as Partial<PropertyBindingData>;
        const type = (value as { type?: string }).type;

        const migration = migrateLegacyAudioFeatureBinding(key, payload);
        if (migration) {
            for (const clearedKey of migration.clearedKeys) {
                delete bindings[clearedKey as keyof ElementBindings];
            }
            for (const [replacementKey, binding] of Object.entries(migration.replacements)) {
                bindings[replacementKey as keyof ElementBindings] = binding;
            }
            continue;
        }

        if (type === 'constant') {
            let constantValue = (payload as { value?: unknown }).value;
            if (key === 'features') {
                if (Array.isArray(constantValue)) {
                    const { descriptors, smoothingValues } = stripDescriptorArraySmoothing(constantValue);
                    if (smoothingValues.length && migratedSmoothing == null) {
                        migratedSmoothing = smoothingValues[0] ?? null;
                    }
                    const migratedDescriptors = descriptors.map((entry) => migrateDescriptorChannels(entry));
                    const normalized = migratedDescriptors
                        .map((entry) => entry.descriptor)
                        .filter((entry): entry is AudioFeatureDescriptor => entry != null);
                    constantValue = normalized;
                    applyChannelSelectorsToBindings(bindings, migratedDescriptors);
                } else {
                    const { descriptor, smoothing } = stripDescriptorSmoothing(constantValue);
                    if (smoothing != null && migratedSmoothing == null) {
                        migratedSmoothing = smoothing;
                    }
                    const migrated = migrateDescriptorChannels(descriptor);
                    constantValue = migrated.descriptor ? [migrated.descriptor] : [];
                    applyChannelSelectorsToBindings(bindings, [migrated]);
                }
            }
            bindings[key] = { type: 'constant', value: constantValue };
            continue;
        }
        if (type === 'macro' && typeof (payload as { macroId?: unknown }).macroId === 'string') {
            const macroId = (payload as { macroId: string }).macroId;
            bindings[key] = { type: 'macro', macroId };
            continue;
        }
        if (type === 'keyframes' && typeof (payload as { channelId?: unknown }).channelId === 'string') {
            const channelId = (payload as { channelId: string }).channelId;
            bindings[key] = { type: 'keyframes', channelId };
            continue;
        }
        if (type === 'audioFeature') {
            const legacyMigration = migrateLegacyAudioFeatureBinding(key, payload);
            if (legacyMigration) {
                for (const clearedKey of legacyMigration.clearedKeys) {
                    delete bindings[clearedKey as keyof ElementBindings];
                }
                for (const [replacementKey, binding] of Object.entries(legacyMigration.replacements)) {
                    bindings[replacementKey as keyof ElementBindings] = binding;
                }
            }
        }
    }
    if (migratedSmoothing != null) {
        const propertyKey = resolveSmoothingProperty(raw.type);
        if (propertyKey && !bindings[propertyKey]) {
            const normalized = normalizeSmoothingValue(migratedSmoothing);
            bindings[propertyKey] = { type: 'constant', value: normalized };
            logSmoothingMigration(raw.id, raw.type, normalized);
        }
    }
    ensureDefaultAnalysisProfileBinding(bindings);
    return bindings;
}

function serializeElement(element: SceneElementRecord, bindings: ElementBindings): SceneSerializedElement {
    const properties: Record<string, PropertyBindingData> = {};
    for (const [key, binding] of Object.entries(bindings)) {
        if (binding.type === 'constant') {
            properties[key] = { type: 'constant', value: binding.value } satisfies PropertyBindingData;
        } else if (binding.type === 'macro') {
            properties[key] = { type: 'macro', macroId: binding.macroId } satisfies PropertyBindingData;
        } else if (binding.type === 'keyframes') {
            properties[key] = { type: 'keyframes', channelId: binding.channelId };
        }
    }
    return {
        id: element.id,
        type: element.type,
        properties,
    };
}

function createRuntimeMeta(): SceneRuntimeMeta {
    const now = Date.now();
    return {
        schemaVersion: INTERNAL_SCENE_STORE_SCHEMA_VERSION,
        initializedAt: now,
        lastMutatedAt: now,
        persistentDirty: false,
        hasInitializedScene: false,
    };
}

function markDirty(prev: SceneStoreState, source: SceneMutationSource): SceneRuntimeMeta {
    const now = Date.now();
    return {
        ...prev.runtimeMeta,
        persistentDirty: true,
        lastMutationSource: source,
        lastMutatedAt: now,
        hasInitializedScene: true,
    };
}

function buildMacroState(payload?: SceneSerializedMacros | null): SceneMacroState {
    if (!payload || !payload.macros) return { byId: {}, allIds: [], exportedAt: undefined };
    const knownIds = new Set(Object.keys(payload.macros));
    // Use persisted allIds order when available, falling back to key order.
    const allIds: string[] = Array.isArray(payload.allIds)
        ? payload.allIds.filter((id) => knownIds.has(id))
        : Object.keys(payload.macros);
    const byId: Record<string, Macro> = {};
    for (const id of allIds) {
        const macro = payload.macros[id];
        byId[id] = {
            ...macro,
            options: cloneMacroOptions(macro?.options),
        };
    }
    const hasMacros = allIds.length > 0;
    const exportedAt = hasMacros
        ? typeof payload.exportedAt === 'number'
            ? payload.exportedAt
            : Date.now()
        : undefined;
    return { byId, allIds, exportedAt };
}

function buildMacroPayload(state: SceneMacroState): SceneSerializedMacros | undefined {
    if (state.allIds.length === 0) return undefined;
    const macros: Record<string, Macro> = {};
    for (const id of state.allIds) {
        const macro = state.byId[id];
        if (macro) macros[id] = { ...macro };
    }
    const payload: SceneSerializedMacros = { macros, allIds: [...state.allIds] };
    if (typeof state.exportedAt === 'number') payload.exportedAt = state.exportedAt;
    return payload;
}

function cloneMacroOptions(source?: Macro['options']): Macro['options'] {
    if (!source) return {} as Macro['options'];
    const next: Macro['options'] = { ...source };
    if (Array.isArray(source.selectOptions)) {
        next.selectOptions = source.selectOptions.map((entry) => ({ ...entry }));
    }
    if (Array.isArray(source.allowedTrackTypes)) {
        next.allowedTrackTypes = [...source.allowedTrackTypes];
    }
    return next;
}

type MacroValidationResult = { valid: true } | { valid: false; reason?: string };

function validateMacroValue(
    type: Macro['type'],
    value: unknown,
    options: Macro['options'] = {} as Macro['options']
): MacroValidationResult {
    switch (type) {
        case 'number':
            if (typeof value !== 'number' || Number.isNaN(value)) return { valid: false };
            if (typeof options.min === 'number' && value < options.min) return { valid: false };
            if (typeof options.max === 'number' && value > options.max) return { valid: false };
            return { valid: true };
        case 'string':
            return { valid: typeof value === 'string' };
        case 'boolean':
            return { valid: typeof value === 'boolean' };
        case 'color':
            return { valid: typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(value) };
        case 'colorAlpha':
            if (typeof value !== 'string') return { valid: false };
            if (/^#[0-9A-Fa-f]{8}$/i.test(value)) return { valid: true };
            if (/^#[0-9A-Fa-f]{6}$/i.test(value)) return { valid: true };
            return { valid: false };
        case 'font':
            if (typeof value !== 'string') return { valid: false };
            if (value.trim() === '') return { valid: true };
            const parts = value.split('|');
            if (parts.length === 1) return { valid: true };
            if (parts.length === 2) {
                return { valid: /^(?:100|200|300|400|500|600|700|800|900)$/.test(parts[1]) };
            }
            return { valid: false };
        case 'select':
            if (!Array.isArray(options.selectOptions) || options.selectOptions.length === 0) {
                return { valid: true };
            }
            return { valid: options.selectOptions.some((opt) => opt.value === value) };
        case 'file':
            if (value === null || value === undefined) return { valid: true };
            if (typeof File === 'undefined') return { valid: true };
            return { valid: value instanceof File };
        case 'timelineTrackRef':
            if (value == null) return { valid: true };
            const allowed =
                Array.isArray(options.allowedTrackTypes) && options.allowedTrackTypes.length
                    ? options.allowedTrackTypes
                    : ['midi'];
            const allowedSet = new Set(allowed);
            const toCheck = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

            if (!Array.isArray(value) && typeof value !== 'string') {
                return { valid: false, reason: 'Expected a track id string or array.' };
            }

            if (Array.isArray(value) && !value.every((entry) => typeof entry === 'string')) {
                return { valid: false, reason: 'Track assignments must be string ids.' };
            }

            const trackIds = toCheck.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
            if (trackIds.length === 0) {
                return { valid: true };
            }

            const timelineState = useTimelineStore.getState();
            for (const trackId of trackIds) {
                const track = timelineState.tracks[trackId] as { type?: string } | undefined;
                if (!track || (track.type !== 'audio' && track.type !== 'midi')) {
                    continue;
                }
                if (!allowedSet.has(track.type)) {
                    const allowedLabel = (() => {
                        const labels = allowed.map((entry) => (entry === 'audio' ? 'audio' : 'MIDI'));
                        if (labels.length === 1) {
                            return `${labels[0]} tracks`;
                        }
                        if (labels.length === 2) {
                            return `${labels[0]} or ${labels[1]} tracks`;
                        }
                        return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]} tracks`;
                    })();
                    const actualLabel = track.type === 'audio' ? 'audio' : 'MIDI';
                    return {
                        valid: false,
                        reason: `Track '${trackId}' is ${actualLabel}, but this macro accepts ${allowedLabel}.`,
                    };
                }
            }
            return { valid: true };
        default:
            return { valid: true };
    }
}

function normalizeIndex(targetIndex: number, size: number): number {
    if (!Number.isFinite(targetIndex)) return size;
    if (targetIndex < 0) return 0;
    if (targetIndex > size) return size;
    return Math.floor(targetIndex);
}

function readZIndexValue(binding: BindingState | undefined): number | null {
    if (!binding || binding.type !== 'constant') return null;
    const value = typeof binding.value === 'number' ? binding.value : Number(binding.value);
    return Number.isFinite(value) ? value : null;
}

function sortElementIdsByZIndex(order: string[], byElement: Record<string, ElementBindings>): string[] {
    const enriched = order.map((id, index) => ({
        id,
        z: readZIndexValue(byElement[id]?.zIndex) ?? Number.NEGATIVE_INFINITY,
        index,
    }));

    enriched.sort((a, b) => {
        if (a.z === b.z) return a.index - b.index;
        return b.z - a.z;
    });

    return enriched.map((entry) => entry.id);
}

function ordersEqual(a: string[], b: string[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function graphIndexes(graph: SceneGraphState) {
    return { graph, ...buildSceneGraphIndexes(graph), order: deriveElementOrder(graph) };
}

function graphWithInsertedElement(
    graph: SceneGraphState,
    elementId: string,
    index: number,
    name = elementId
): SceneGraphState {
    const next = cloneSceneGraph(graph);
    const root = next.nodesById[next.rootId];
    if (!root || root.kind !== 'root') throw new Error('SceneStore: graph root is invalid');
    const nodeId = elementNodeId(elementId, new Set(Object.keys(next.nodesById)));
    next.nodesById[nodeId] = { ...createNodeBase(nodeId, root.id, name), kind: 'element', elementId };
    root.children.splice(normalizeIndex(index, root.children.length), 0, nodeId);
    next.revision += 1;
    return next;
}

function graphWithElementOrder(graph: SceneGraphState, order: readonly string[]): SceneGraphState {
    const next = cloneSceneGraph(graph);
    const root = next.nodesById[next.rootId];
    if (!root || root.kind !== 'root') throw new Error('SceneStore: graph root is invalid');
    const indexes = buildSceneGraphIndexes(next);
    root.children = order.map((id) => indexes.nodeIdByElementId[id]).filter(Boolean);
    next.revision += 1;
    return next;
}

const createSceneStoreState = (
    set: (
        partial: Partial<SceneStoreState> | ((state: SceneStoreState) => Partial<SceneStoreState>),
        replace?: boolean
    ) => void,
    get: () => SceneStoreState
): SceneStoreState => ({
    settings: { ...DEFAULT_SCENE_SETTINGS },
    elements: {},
    ...graphIndexes(createFlatSceneGraph([])),
    bindings: createEmptyBindingsState(),
    macros: { byId: {}, allIds: [], exportedAt: undefined },
    fonts: { assets: {}, order: [], totalBytes: 0, licensingAcknowledgedAt: undefined },
    interaction: createInitialInteractionState(),
    runtimeMeta: createRuntimeMeta(),
    automation: createEmptyAutomationState(),
    nodeBindings: {},
    propertyOverrides: {},

    addElement: (input) => {
        set((state) => {
            if (!input.id) throw new Error('SceneStore.addElement: id is required');
            if (state.elements[input.id])
                throw new Error(`SceneStore.addElement: element '${input.id}' already exists`);

            const element: SceneElementRecord = {
                id: input.id,
                type: input.type,
                createdAt: input.createdAt ?? Date.now(),
                createdBy: input.createdBy,
            };

            const nextElements = { ...state.elements, [element.id]: element };
            const nextOrder = [...state.order];
            const insertionIndex = normalizeIndex(input.index ?? nextOrder.length, nextOrder.length);
            nextOrder.splice(insertionIndex, 0, element.id);

            const initialBindings = cloneBindingsMap(input.bindings ?? {}, input.type);
            const nextByElement = { ...state.bindings.byElement, [element.id]: initialBindings };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
                byTargetMacro: rebuildTargetMacroIndex(nextByElement, state.nodeBindings),
            };
            const nextGraph = graphWithInsertedElement(state.graph, element.id, insertionIndex);

            return {
                ...state,
                elements: nextElements,
                ...graphIndexes(nextGraph),
                bindings: nextBindings,
                runtimeMeta: markDirty(state, 'addElement'),
            };
        });
    },

    moveElement: (elementId, targetIndex) => {
        set((state) => {
            const currentIndex = state.order.indexOf(elementId);
            if (currentIndex === -1) return state;

            const boundedIndex = normalizeIndex(targetIndex, state.order.length - 1);
            if (currentIndex === boundedIndex) return state;

            const nextOrder = [...state.order];
            nextOrder.splice(currentIndex, 1);
            nextOrder.splice(boundedIndex, 0, elementId);

            const total = nextOrder.length;
            let nextByElement: Record<string, ElementBindings> | null = null;
            let bindingsMutated = false;

            for (let index = 0; index < nextOrder.length; index += 1) {
                const id = nextOrder[index];
                const desiredZ = total - index - 1;
                const sourceMap = nextByElement ?? state.bindings.byElement;
                const existingBindings = sourceMap[id] ?? {};
                const current = existingBindings.zIndex;
                const currentValue = readZIndexValue(current);
                if (current?.type === 'constant' && currentValue === desiredZ) {
                    continue;
                }

                if (!nextByElement) {
                    nextByElement = { ...state.bindings.byElement };
                }

                const nextZBinding: ConstantBindingState = { type: 'constant', value: desiredZ };
                const updatedBindings: ElementBindings = { ...existingBindings, zIndex: nextZBinding };
                nextByElement[id] = updatedBindings;
                bindingsMutated = true;
            }

            const bindingsState = bindingsMutated
                ? {
                      byElement: nextByElement!,
                      byMacro: rebuildMacroIndex(nextByElement!),
                  }
                : state.bindings;
            const nextGraph = graphWithElementOrder(state.graph, nextOrder);

            return {
                ...state,
                ...graphIndexes(nextGraph),
                bindings: bindingsState,
                runtimeMeta: markDirty(state, 'moveElement'),
            };
        });
    },

    duplicateElement: (sourceId, newId, opts) => {
        set((state) => {
            if (!state.elements[sourceId])
                throw new Error(`SceneStore.duplicateElement: source '${sourceId}' not found`);
            if (state.elements[newId])
                throw new Error(`SceneStore.duplicateElement: element '${newId}' already exists`);

            const source = state.elements[sourceId];
            const clonedBindings = cloneBindingsMap(state.bindings.byElement[sourceId] ?? {}, source.type);

            const insertAfter = opts?.insertAfter ?? true;
            const sourceIndex = state.order.indexOf(sourceId);
            const insertionIndex = insertAfter ? sourceIndex + 1 : state.order.length;

            const element: SceneElementRecord = {
                id: newId,
                type: source.type,
                createdAt: Date.now(),
                createdBy: 'duplicate',
            };

            const nextElements = { ...state.elements, [element.id]: element };
            const nextOrder = [...state.order];
            const boundedIndex = normalizeIndex(insertionIndex, nextOrder.length);
            nextOrder.splice(boundedIndex, 0, element.id);

            const nextByElement = { ...state.bindings.byElement, [element.id]: clonedBindings };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
                byTargetMacro: rebuildTargetMacroIndex(nextByElement, state.nodeBindings),
            };
            const nextGraph = graphWithInsertedElement(state.graph, element.id, boundedIndex);

            // Clone automation channels for the duplicated element
            const nextAutomation = { ...state.automation, channels: { ...state.automation.channels } };
            const clonedChannelIds: Record<string, string> = {};
            const occupiedChannelIds = new Set(Object.keys(nextAutomation.channels));
            for (const channel of Object.values(state.automation.channels)) {
                if (channel.target.owner.kind === 'element' && channel.target.owner.id === sourceId) {
                    const cloned = cloneChannel(
                        channel,
                        elementPropertyTarget(newId, channel.target.propertyPath),
                        occupiedChannelIds
                    );
                    occupiedChannelIds.add(cloned.id);
                    nextAutomation.channels[cloned.id] = cloned;
                    clonedChannelIds[channel.id] = cloned.id;
                }
            }

            // Update keyframes binding channelId references to point to the cloned channels
            for (const [key, binding] of Object.entries(clonedBindings)) {
                if (binding.type === 'keyframes') {
                    const clonedChannelId = clonedChannelIds[binding.channelId];
                    if (clonedChannelId) {
                        clonedBindings[key] = {
                            type: 'keyframes',
                            channelId: clonedChannelId,
                        };
                    }
                }
            }

            return {
                ...state,
                elements: nextElements,
                ...graphIndexes(nextGraph),
                bindings: nextBindings,
                automation: {
                    ...nextAutomation,
                    channelIdByTarget: rebuildAutomationTargetIndex(nextAutomation.channels),
                },
                runtimeMeta: markDirty(state, 'duplicateElement'),
            };
        });
    },

    removeElement: (elementId) => {
        set((state) => {
            if (!state.elements[elementId]) return state;

            const { [elementId]: _removedElement, ...remaining } = state.elements;
            const nextOrder = state.order.filter((id) => id !== elementId);
            const { [elementId]: _removedBindings, ...remainingBindings } = state.bindings.byElement;
            const nextBindings: SceneBindingsState = {
                byElement: remainingBindings,
                byMacro: rebuildMacroIndex(remainingBindings),
                byTargetMacro: rebuildTargetMacroIndex(remainingBindings, state.nodeBindings),
            };

            // Remove automation channels for the deleted element
            const nextChannels = { ...state.automation.channels };
            for (const [channelId, channel] of Object.entries(nextChannels)) {
                if (channel.target.owner.kind === 'element' && channel.target.owner.id === elementId) {
                    delete nextChannels[channelId];
                }
            }
            const nextGraph = cloneSceneGraph(state.graph);
            const nodeId = state.nodeIdByElementId[elementId];
            const node = nodeId ? nextGraph.nodesById[nodeId] : undefined;
            if (node?.parentId) {
                const parent = nextGraph.nodesById[node.parentId];
                if (parent && 'children' in parent) parent.children = parent.children.filter((id) => id !== nodeId);
                delete nextGraph.nodesById[nodeId];
                nextGraph.revision += 1;
            }

            return {
                ...state,
                elements: remaining,
                ...graphIndexes(nextGraph),
                bindings: nextBindings,
                automation: { channels: nextChannels, channelIdByTarget: rebuildAutomationTargetIndex(nextChannels) },
                interaction: {
                    ...state.interaction,
                    hoveredElementId:
                        state.interaction.hoveredElementId === elementId ? null : state.interaction.hoveredElementId,
                    editingElementId:
                        state.interaction.editingElementId === elementId ? null : state.interaction.editingElementId,
                },
                runtimeMeta: markDirty(state, 'removeElement'),
            };
        });
        // Sync selection store after state update
        useSelectionStore.getState().removeElementFromSelection(elementId);
    },

    updateElementId: (currentId, nextId) => {
        set((state) => {
            if (!state.elements[currentId]) return state;
            if (currentId === nextId) return state;
            if (state.elements[nextId]) {
                throw new Error(`SceneStore.updateElementId: element '${nextId}' already exists`);
            }

            const element = state.elements[currentId];
            const updatedElement: SceneElementRecord = {
                ...element,
                id: nextId,
            };

            const { [currentId]: _existing, ...remainingElements } = state.elements;
            const nextElements = { ...remainingElements, [nextId]: updatedElement };

            const nextOrder = state.order.map((id) => (id === currentId ? nextId : id));

            const existingBindings = state.bindings.byElement[currentId] ?? {};
            const { [currentId]: _removedBindingState, ...remainingBindings } = state.bindings.byElement;
            const nextByElement = { ...remainingBindings, [nextId]: existingBindings };
            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
                byTargetMacro: rebuildTargetMacroIndex(nextByElement, state.nodeBindings),
            };

            // Structured ownership changes transactionally; opaque channel IDs remain stable.
            const nextChannels = { ...state.automation.channels };
            for (const [channelId, channel] of Object.entries(state.automation.channels)) {
                if (channel.target.owner.kind === 'element' && channel.target.owner.id === currentId) {
                    nextChannels[channelId] = {
                        ...channel,
                        target: elementPropertyTarget(nextId, channel.target.propertyPath),
                        elementId: nextId,
                        propertyKey: channel.target.propertyPath,
                    };
                }
            }

            const nextInteraction: SceneInteractionState = {
                ...state.interaction,
                hoveredElementId:
                    state.interaction.hoveredElementId === currentId ? nextId : state.interaction.hoveredElementId,
                editingElementId:
                    state.interaction.editingElementId === currentId ? nextId : state.interaction.editingElementId,
            };
            const nextGraph = cloneSceneGraph(state.graph);
            const nodeId = state.nodeIdByElementId[currentId];
            const node = nodeId ? nextGraph.nodesById[nodeId] : undefined;
            if (node?.kind === 'element') {
                node.elementId = nextId;
                if (node.name === currentId) node.name = nextId;
                nextGraph.revision += 1;
            }

            return {
                ...state,
                elements: nextElements,
                ...graphIndexes(nextGraph),
                bindings: nextBindings,
                automation: { channels: nextChannels, channelIdByTarget: rebuildAutomationTargetIndex(nextChannels) },
                interaction: nextInteraction,
                runtimeMeta: markDirty(state, 'updateElementId'),
            };
        });
        // Sync selection store after state update
        useSelectionStore.getState().renameElementInSelection(currentId, nextId);
    },

    updateSettings: (patch) => {
        set((state) => ({
            ...state,
            settings: { ...state.settings, ...patch },
            runtimeMeta: markDirty(state, 'updateSettings'),
        }));
    },

    updateBindings: (elementId, patch) => {
        set((state) => {
            const existing = state.bindings.byElement[elementId];
            if (!existing) throw new Error(`SceneStore.updateBindings: element '${elementId}' not found`);

            const elementType = state.elements[elementId]?.type;

            let changed = false;
            let zIndexChanged = false;
            const nextBindingsForElement: ElementBindings = { ...existing };

            for (const [key, binding] of Object.entries(patch)) {
                if (binding == null) {
                    if (key in nextBindingsForElement) {
                        delete nextBindingsForElement[key];
                        changed = true;
                        if (key === 'zIndex') {
                            zIndexChanged = true;
                        }
                    }
                    continue;
                }

                if ((binding as any)?.type === 'audioFeature') {
                    const migration = migrateLegacyAudioFeatureBinding(key, binding);
                    if (migration) {
                        for (const clearedKey of migration.clearedKeys) {
                            if (clearedKey in nextBindingsForElement) {
                                delete nextBindingsForElement[clearedKey];
                                changed = true;
                                if (clearedKey === 'zIndex') {
                                    zIndexChanged = true;
                                }
                            }
                        }
                        for (const [replacementKey, replacementBinding] of Object.entries(migration.replacements)) {
                            const current = nextBindingsForElement[replacementKey];
                            if (!current || !bindingEquals(current, replacementBinding)) {
                                nextBindingsForElement[replacementKey] = replacementBinding;
                                changed = true;
                                if (replacementKey === 'zIndex') {
                                    zIndexChanged = true;
                                }
                            }
                        }
                        continue;
                    }
                }

                let normalized: BindingState;
                if (binding.type === 'constant') {
                    if (key === 'features') {
                        let smoothingFromDescriptor: number | null = null;
                        let descriptors: AudioFeatureDescriptor[] = [];
                        const value = binding.value;
                        if (Array.isArray(value)) {
                            const { descriptors: entries, smoothingValues } = stripDescriptorArraySmoothing(value);
                            if (smoothingValues.length) {
                                smoothingFromDescriptor = smoothingValues[0] ?? null;
                            }
                            descriptors = entries
                                .filter((entry): entry is Record<string, unknown> & { featureKey: string } =>
                                    Boolean(
                                        entry &&
                                        typeof entry === 'object' &&
                                        typeof (entry as { featureKey?: unknown }).featureKey === 'string'
                                    )
                                )
                                .map((entry) => entry as AudioFeatureDescriptor);
                        } else {
                            const { descriptor, smoothing } = stripDescriptorSmoothing(value);
                            if (smoothing != null) {
                                smoothingFromDescriptor = smoothing;
                            }
                            if (descriptor && typeof (descriptor as { featureKey?: unknown }).featureKey === 'string') {
                                descriptors = [descriptor as unknown as AudioFeatureDescriptor];
                            } else {
                                descriptors = [];
                            }
                        }
                        normalized = { type: 'constant', value: descriptors };
                        if (smoothingFromDescriptor != null) {
                            const smoothingKey = resolveSmoothingProperty(elementType);
                            if (smoothingKey && !patch[smoothingKey]) {
                                const normalizedRadius = normalizeSmoothingValue(smoothingFromDescriptor);
                                const currentSmoothing = nextBindingsForElement[smoothingKey];
                                if (
                                    !currentSmoothing ||
                                    currentSmoothing.type !== 'constant' ||
                                    currentSmoothing.value !== normalizedRadius
                                ) {
                                    nextBindingsForElement[smoothingKey] = {
                                        type: 'constant',
                                        value: normalizedRadius,
                                    };
                                    changed = true;
                                }
                            }
                        }
                    } else if (key === resolveSmoothingProperty(elementType)) {
                        normalized = { type: 'constant', value: normalizeSmoothingValue(binding.value) };
                    } else {
                        normalized = { type: 'constant', value: binding.value };
                    }
                } else if (binding.type === 'macro') {
                    normalized = { type: 'macro', macroId: binding.macroId };
                } else if (binding.type === 'keyframes') {
                    normalized = { type: 'keyframes', channelId: (binding as KeyframesBindingState).channelId };
                } else {
                    console.warn('[SceneStore] Ignoring unsupported binding type', binding);
                    continue;
                }

                const current = nextBindingsForElement[key];
                if (!current || !bindingEquals(current, normalized)) {
                    nextBindingsForElement[key] = normalized;
                    changed = true;
                    if (key === 'zIndex') {
                        zIndexChanged = true;
                    }
                }
            }

            if (ensureDefaultAnalysisProfileBinding(nextBindingsForElement)) {
                changed = true;
            }

            if (!changed) return state;

            // Clean up orphaned automation channels when a binding transitions from keyframes
            let nextAutomation = state.automation;
            for (const [key, newBinding] of Object.entries(nextBindingsForElement)) {
                const prevBinding = existing[key];
                if (prevBinding?.type === 'keyframes' && newBinding?.type !== 'keyframes') {
                    const orphanedChannelId = (prevBinding as KeyframesBindingState).channelId;
                    if (nextAutomation.channels[orphanedChannelId]) {
                        if (nextAutomation === state.automation) {
                            nextAutomation = { ...state.automation, channels: { ...state.automation.channels } };
                        }
                        delete nextAutomation.channels[orphanedChannelId];
                    }
                }
            }

            const nextByElement = { ...state.bindings.byElement, [elementId]: nextBindingsForElement };
            const reordered = zIndexChanged ? sortElementIdsByZIndex(state.order, nextByElement) : state.order;

            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
                byTargetMacro: rebuildTargetMacroIndex(nextByElement, state.nodeBindings),
            };

            const nextGraph =
                zIndexChanged && !ordersEqual(reordered, state.order)
                    ? graphWithElementOrder(state.graph, reordered)
                    : state.graph;
            if (nextAutomation !== state.automation) {
                nextAutomation.channelIdByTarget = rebuildAutomationTargetIndex(nextAutomation.channels);
            }
            return {
                ...state,
                ...(nextGraph === state.graph ? {} : graphIndexes(nextGraph)),
                bindings: nextBindings,
                automation: nextAutomation,
                runtimeMeta: markDirty(state, 'updateBindings'),
            };
        });
    },

    updateNodeBindings: (nodeId, patch) => {
        set((state) => {
            if (!state.graph.nodesById[nodeId] || nodeId === state.graph.rootId) {
                throw new Error(`SceneStore.updateNodeBindings: node '${nodeId}' not found`);
            }
            const current = state.nodeBindings[nodeId] ?? {};
            const next = { ...current };
            let automation = state.automation;
            for (const [path, binding] of Object.entries(patch)) {
                const previous = current[path];
                if (binding == null) delete next[path];
                else next[path] = cloneBinding(binding);
                if (previous?.type === 'keyframes' && binding?.type !== 'keyframes') {
                    const channels = { ...automation.channels };
                    delete channels[previous.channelId];
                    automation = {
                        channels,
                        channelIdByTarget: rebuildAutomationTargetIndex(channels),
                    };
                }
            }
            return {
                ...state,
                nodeBindings: { ...state.nodeBindings, [nodeId]: next },
                bindings: {
                    ...state.bindings,
                    byTargetMacro: rebuildTargetMacroIndex(state.bindings.byElement, {
                        ...state.nodeBindings,
                        [nodeId]: next,
                    }),
                },
                automation,
                runtimeMeta: markDirty(state, 'updateAutomation'),
            };
        });
    },

    removeNodeBindings: (nodeIds) => {
        set((state) => {
            const removed = new Set(nodeIds);
            const nodeBindings = { ...state.nodeBindings };
            for (const id of removed) delete nodeBindings[id];
            const channels = Object.fromEntries(
                Object.entries(state.automation.channels).filter(
                    ([, channel]) => !(channel.target.owner.kind === 'node' && removed.has(channel.target.owner.id))
                )
            );
            return {
                ...state,
                nodeBindings,
                bindings: {
                    ...state.bindings,
                    byTargetMacro: rebuildTargetMacroIndex(state.bindings.byElement, nodeBindings),
                },
                automation: { channels, channelIdByTarget: rebuildAutomationTargetIndex(channels) },
                runtimeMeta: markDirty(state, 'updateAutomation'),
            };
        });
    },

    createMacro: (macroId, definition) => {
        set((state) => {
            const id = typeof macroId === 'string' ? macroId.trim() : '';
            if (!id) throw new Error('SceneStore.createMacro: macroId is required');
            if (state.macros.byId[id]) {
                throw new Error(`SceneStore.createMacro: macro '${id}' already exists`);
            }

            const options = cloneMacroOptions(definition.options);
            const defaultValue = definition.defaultValue !== undefined ? definition.defaultValue : definition.value;
            const validation = validateMacroValue(definition.type, definition.value, options);
            if (!validation.valid) {
                const reason = validation.reason ? `: ${validation.reason}` : '';
                throw new Error(`SceneStore.createMacro: invalid value for macro '${id}'${reason}`);
            }

            const now = Date.now();
            const macro: Macro = {
                name: id,
                type: definition.type,
                value: definition.value,
                defaultValue,
                options,
                createdAt: now,
                lastModified: now,
            };

            const nextById = { ...state.macros.byId, [id]: macro };
            const nextAllIds = [...state.macros.allIds, id];

            return {
                ...state,
                macros: {
                    byId: nextById,
                    allIds: nextAllIds,
                    exportedAt: now,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    updateMacroValue: (macroId, value) => {
        set((state) => {
            const macro = state.macros.byId[macroId];
            if (!macro) return state;
            const validation = validateMacroValue(macro.type, value, macro.options);
            if (!validation.valid) {
                const reason = validation.reason ? `: ${validation.reason}` : '';
                throw new Error(`SceneStore.updateMacroValue: invalid value for macro '${macroId}'${reason}`);
            }
            if (Object.is(macro.value, value)) return state;

            const now = Date.now();
            const nextMacro: Macro = {
                ...macro,
                value,
                lastModified: now,
            };
            const nextExportedAt = typeof state.macros.exportedAt === 'number' ? state.macros.exportedAt : now;

            return {
                ...state,
                macros: {
                    byId: { ...state.macros.byId, [macroId]: nextMacro },
                    allIds: [...state.macros.allIds],
                    exportedAt: nextExportedAt,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    renameMacro: (currentId, nextId) => {
        set((state) => {
            const macro = state.macros.byId[currentId];
            if (!macro) return state;

            const trimmed = typeof nextId === 'string' ? nextId.trim() : '';
            if (!trimmed) {
                throw new Error('SceneStore.renameMacro: nextId is required');
            }
            if (trimmed === currentId) {
                return state;
            }
            if (state.macros.byId[trimmed]) {
                throw new Error(`SceneStore.renameMacro: macro '${trimmed}' already exists`);
            }

            const now = Date.now();
            const renamed: Macro = {
                ...macro,
                name: trimmed,
                lastModified: now,
            };

            const nextById = { ...state.macros.byId };
            delete nextById[currentId];
            nextById[trimmed] = renamed;

            const nextAllIds = state.macros.allIds.map((id) => (id === currentId ? trimmed : id));

            const mutatedBindings: Record<string, ElementBindings> = {};
            let bindingsMutated = false;

            for (const [elementId, bindings] of Object.entries(state.bindings.byElement)) {
                let elementMutated = false;
                const updated: ElementBindings = { ...bindings };

                for (const [property, binding] of Object.entries(bindings)) {
                    if (binding?.type === 'macro' && binding.macroId === currentId) {
                        updated[property] = { type: 'macro', macroId: trimmed };
                        elementMutated = true;
                    }
                }

                if (elementMutated) {
                    mutatedBindings[elementId] = updated;
                    bindingsMutated = true;
                }
            }

            const nextByElement = bindingsMutated
                ? { ...state.bindings.byElement, ...mutatedBindings }
                : state.bindings.byElement;
            const nextNodeBindings = { ...state.nodeBindings };
            let nodeBindingsMutated = false;
            for (const [nodeId, bindings] of Object.entries(state.nodeBindings)) {
                for (const [property, binding] of Object.entries(bindings)) {
                    if (binding.type === 'macro' && binding.macroId === currentId) {
                        if (!nodeBindingsMutated || nextNodeBindings[nodeId] === bindings) {
                            nextNodeBindings[nodeId] = { ...bindings };
                        }
                        nextNodeBindings[nodeId][property] = { type: 'macro', macroId: trimmed };
                        nodeBindingsMutated = true;
                    }
                }
            }

            const nextBindings: SceneBindingsState =
                bindingsMutated || nodeBindingsMutated
                    ? {
                          byElement: nextByElement,
                          byMacro: rebuildMacroIndex(nextByElement),
                          byTargetMacro: rebuildTargetMacroIndex(nextByElement, nextNodeBindings),
                      }
                    : state.bindings;

            const nextExportedAt = typeof state.macros.exportedAt === 'number' ? state.macros.exportedAt : now;

            return {
                ...state,
                bindings: nextBindings,
                nodeBindings: nextNodeBindings,
                macros: {
                    byId: nextById,
                    allIds: nextAllIds,
                    exportedAt: nextExportedAt,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    reorderMacros: (order) => {
        set((state) => {
            const existing = new Set(state.macros.allIds);
            const seen = new Set<string>();
            const next: string[] = [];
            for (const id of order) {
                if (existing.has(id) && !seen.has(id)) {
                    seen.add(id);
                    next.push(id);
                }
            }
            for (const id of state.macros.allIds) {
                if (!seen.has(id)) next.push(id);
            }
            return {
                ...state,
                macros: { ...state.macros, allIds: next },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    deleteMacro: (macroId) => {
        set((state) => {
            const macro = state.macros.byId[macroId];
            if (!macro) return state;

            const assignments = state.bindings.byMacro[macroId] ?? [];
            const nextByElement: Record<string, ElementBindings> = { ...state.bindings.byElement };
            const mutatedIds = new Set<string>();

            for (const assignment of assignments) {
                const current = nextByElement[assignment.elementId];
                if (!current) continue;
                if (!mutatedIds.has(assignment.elementId)) {
                    nextByElement[assignment.elementId] = { ...current };
                    mutatedIds.add(assignment.elementId);
                }
                const bindings = nextByElement[assignment.elementId];
                const binding = bindings[assignment.propertyPath];
                if (binding && binding.type === 'macro' && binding.macroId === macroId) {
                    bindings[assignment.propertyPath] = { type: 'constant', value: macro.value };
                }
            }
            const nextNodeBindings = { ...state.nodeBindings };
            const nodeAssignments = state.bindings.byTargetMacro?.[macroId] ?? [];
            for (const { target } of nodeAssignments) {
                if (target.owner.kind !== 'node') continue;
                const current = nextNodeBindings[target.owner.id];
                const binding = current?.[target.propertyPath];
                if (!current || binding?.type !== 'macro' || binding.macroId !== macroId) continue;
                nextNodeBindings[target.owner.id] = {
                    ...current,
                    [target.propertyPath]: { type: 'constant', value: macro.value },
                };
            }

            const bindingsState: SceneBindingsState = {
                byElement: mutatedIds.size ? nextByElement : state.bindings.byElement,
                byMacro: rebuildMacroIndex(mutatedIds.size ? nextByElement : state.bindings.byElement),
                byTargetMacro: rebuildTargetMacroIndex(
                    mutatedIds.size ? nextByElement : state.bindings.byElement,
                    nextNodeBindings
                ),
            };

            const { [macroId]: _removed, ...remainingMacros } = state.macros.byId;
            const nextAllIds = state.macros.allIds.filter((id) => id !== macroId);
            const hasRemaining = nextAllIds.length > 0;
            const nextExportedAt = hasRemaining
                ? typeof state.macros.exportedAt === 'number'
                    ? state.macros.exportedAt
                    : Date.now()
                : undefined;

            return {
                ...state,
                bindings: bindingsState,
                nodeBindings: nextNodeBindings,
                macros: {
                    byId: remainingMacros,
                    allIds: nextAllIds,
                    exportedAt: nextExportedAt,
                },
                runtimeMeta: markDirty(state, 'updateMacros'),
            };
        });
    },

    registerFontAsset: (asset) => {
        set((state) => {
            if (!asset?.id) throw new Error('SceneStore.registerFontAsset: id is required');
            const existing = state.fonts.assets[asset.id];
            const normalized = normalizeFontAssetInput(asset, existing);
            const nextAssets = { ...state.fonts.assets, [asset.id]: normalized };
            const nextOrder = [...state.fonts.order.filter((id) => id !== asset.id), asset.id];
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    assets: nextAssets,
                    order: nextOrder,
                    totalBytes: computeFontBytes(nextAssets),
                },
                runtimeMeta: markDirty(state, 'updateFonts'),
            };
        });
    },

    updateFontAsset: (assetId, patch) => {
        set((state) => {
            const existing = state.fonts.assets[assetId];
            if (!existing) return state;
            const merged: FontAsset = normalizeFontAssetInput(
                { ...existing, ...patch, id: assetId } as FontAsset,
                existing
            );
            if (JSON.stringify(existing) === JSON.stringify(merged)) {
                return state;
            }
            const nextAssets = { ...state.fonts.assets, [assetId]: merged };
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    assets: nextAssets,
                    totalBytes: computeFontBytes(nextAssets),
                },
                runtimeMeta: markDirty(state, 'updateFonts'),
            };
        });
    },

    deleteFontAsset: (assetId) => {
        set((state) => {
            if (!state.fonts.assets[assetId]) return state;
            const nextAssets = { ...state.fonts.assets };
            delete nextAssets[assetId];
            const nextOrder = state.fonts.order.filter((id) => id !== assetId);
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    assets: nextAssets,
                    order: nextOrder,
                    totalBytes: computeFontBytes(nextAssets),
                },
                runtimeMeta: markDirty(state, 'updateFonts'),
            };
        });
    },

    acknowledgeFontLicensing: (timestamp) => {
        set((state) => {
            const resolved = typeof timestamp === 'number' ? timestamp : Date.now();
            if (state.fonts.licensingAcknowledgedAt === resolved) {
                return state;
            }
            return {
                ...state,
                fonts: {
                    ...state.fonts,
                    licensingAcknowledgedAt: resolved,
                },
            };
        });
    },

    clearScene: () => {
        const emptyGraph = createFlatSceneGraph([]);
        set((state) => ({
            ...state,
            settings: { ...DEFAULT_SCENE_SETTINGS },
            elements: {},
            ...graphIndexes(emptyGraph),
            bindings: createEmptyBindingsState(),
            macros: { byId: {}, allIds: [], exportedAt: undefined },
            fonts: { assets: {}, order: [], totalBytes: 0, licensingAcknowledgedAt: undefined },
            interaction: createInitialInteractionState(),
            automation: createEmptyAutomationState(),
            nodeBindings: {},
            runtimeMeta: markDirty(state, 'clearScene'),
        }));
    },

    importScene: (payload) => {
        const migratedPayload = migrateSceneAudioSystemV5(payload);
        set((state) => {
            // Normalize elements: accept either V6 Record+order or plain array
            let elements: SceneSerializedElement[];
            const rawElements = migratedPayload.elements;
            if (Array.isArray(rawElements)) {
                elements = rawElements;
            } else if (rawElements && typeof rawElements === 'object') {
                const order = (migratedPayload as any).elementsOrder as string[] | undefined;
                if (Array.isArray(order)) {
                    elements = order
                        .map((id) => (rawElements as Record<string, SceneSerializedElement>)[id])
                        .filter(Boolean);
                } else {
                    elements = Object.values(rawElements);
                }
            } else {
                elements = [];
            }

            const nextElements: Record<string, SceneElementRecord> = {};
            const nextOrder: string[] = [];
            const nextByElement: Record<string, ElementBindings> = {};

            for (const el of elements) {
                if (!el || typeof el !== 'object') continue;
                if (typeof el.id !== 'string' || typeof el.type !== 'string') continue;
                nextOrder.push(el.id);
                nextElements[el.id] = {
                    id: el.id,
                    type: el.type,
                    createdAt: Date.now(),
                };
                nextByElement[el.id] = deserializeElementBindings(el);
            }

            const incomingGraph = migratedPayload.graph ?? createFlatSceneGraph(nextOrder);
            const graphValidation = validateSceneGraph(incomingGraph, Object.keys(nextElements));
            if (!graphValidation.ok) {
                throw new Error(`SceneStore.importScene: invalid scene graph (${graphValidation.errors[0]?.message})`);
            }
            const nextGraph = cloneSceneGraph(incomingGraph);
            const derivedOrder = deriveElementOrder(nextGraph);

            const migratedAutomation = migrateLegacyAutomationState(migratedPayload.automation);
            for (const bindings of Object.values(nextByElement)) {
                for (const binding of Object.values(bindings)) {
                    if (binding.type === 'keyframes' && migratedAutomation.channelIdMap[binding.channelId]) {
                        binding.channelId = migratedAutomation.channelIdMap[binding.channelId];
                    }
                }
            }
            const nextNodeBindings: Record<string, ElementBindings> = {};
            for (const [nodeId, bindings] of Object.entries(migratedPayload.nodeBindings ?? {})) {
                if (!nextGraph.nodesById[nodeId] || !bindings) continue;
                nextNodeBindings[nodeId] = Object.fromEntries(
                    Object.entries(bindings).map(([path, binding]) => [
                        path,
                        binding.type === 'keyframes' && migratedAutomation.channelIdMap[binding.channelId]
                            ? { ...binding, channelId: migratedAutomation.channelIdMap[binding.channelId] }
                            : cloneBinding(binding),
                    ])
                );
            }

            const nextBindings: SceneBindingsState = {
                byElement: nextByElement,
                byMacro: rebuildMacroIndex(nextByElement),
                byTargetMacro: rebuildTargetMacroIndex(nextByElement, nextNodeBindings),
            };

            const nextSettings = {
                ...DEFAULT_SCENE_SETTINGS,
                ...(migratedPayload.sceneSettings ?? {}),
            } satisfies SceneSettingsState;

            const importTimestamp = Date.now();

            const normalizedFontAssets: Record<string, FontAsset> = {};
            if (migratedPayload.fontAssets) {
                for (const [assetId, asset] of Object.entries(migratedPayload.fontAssets)) {
                    if (!assetId || !asset) continue;
                    const id = typeof asset.id === 'string' ? asset.id : assetId;
                    normalizedFontAssets[id] = normalizeFontAssetInput({ ...asset, id } as FontAsset);
                }
            }
            const fontOrder = Object.keys(normalizedFontAssets);
            const fontLicensingAcknowledgedAt =
                typeof migratedPayload.fontLicensingAcknowledgedAt === 'number'
                    ? migratedPayload.fontLicensingAcknowledgedAt
                    : undefined;

            return {
                ...state,
                settings: nextSettings,
                elements: nextElements,
                ...graphIndexes(nextGraph),
                bindings: nextBindings,
                macros: buildMacroState(migratedPayload.macros),
                fonts: {
                    assets: normalizedFontAssets,
                    order: fontOrder,
                    totalBytes: computeFontBytes(normalizedFontAssets),
                    licensingAcknowledgedAt: fontLicensingAcknowledgedAt,
                },
                interaction: createInitialInteractionState(),
                automation: migratedAutomation.state,
                nodeBindings: nextNodeBindings,
                runtimeMeta: {
                    ...state.runtimeMeta,
                    persistentDirty: false,
                    lastHydratedAt: importTimestamp,
                    lastMutationSource: 'importScene',
                    lastMutatedAt: importTimestamp,
                    hasInitializedScene: true,
                },
            };
        });
    },

    exportSceneDraft: () => {
        const state = get();
        const elements: Record<string, SceneSerializedElement> = {};
        const elementsOrder: string[] = [];
        const elementErrors: Array<{ id: string; type: string; message: string }> = [];
        state.order.forEach((id) => {
            const element = state.elements[id];
            if (!element) return;
            const bindings = state.bindings.byElement[id] ?? {};
            try {
                elements[id] = serializeElement(element, bindings);
                elementsOrder.push(id);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                elementErrors.push({ id, type: element.type, message });
                console.warn(`[exportSceneDraft] Failed to serialize element ${id} (${element.type}):`, err);
            }
        });
        const fontAssets = state.fonts.order.reduce(
            (acc, id) => {
                const asset = state.fonts.assets[id];
                if (asset) acc[id] = cloneFontAsset(asset);
                return acc;
            },
            {} as Record<string, FontAsset>
        );
        return {
            elements,
            elementsOrder,
            graph: cloneSceneGraph(state.graph),
            ...(elementErrors.length > 0 ? { elementErrors } : {}),
            sceneSettings: { ...state.settings },
            macros: buildMacroPayload(state.macros),
            ...(Object.keys(fontAssets).length ? { fontAssets } : {}),
            ...(typeof state.fonts.licensingAcknowledgedAt === 'number'
                ? { fontLicensingAcknowledgedAt: state.fonts.licensingAcknowledgedAt }
                : {}),
            ...(Object.keys(state.automation.channels).length
                ? {
                      automation: {
                          channels: Object.fromEntries(
                              Object.entries(state.automation.channels).map(([channelId, channel]) => [
                                  channelId,
                                  {
                                      id: channel.id,
                                      target: {
                                          owner: { ...channel.target.owner },
                                          propertyPath: channel.target.propertyPath,
                                      },
                                      keyframes: channel.keyframes.map((keyframe) => ({
                                          ...keyframe,
                                          segmentInterpolation: { ...keyframe.segmentInterpolation },
                                      })),
                                      valueType: channel.valueType,
                                  },
                              ])
                          ),
                          channelIdByTarget: rebuildAutomationTargetIndex(state.automation.channels),
                      },
                  }
                : {}),
            ...(Object.keys(state.nodeBindings).length
                ? {
                      nodeBindings: Object.fromEntries(
                          Object.entries(state.nodeBindings).map(([nodeId, bindings]) => [
                              nodeId,
                              cloneBindingsMap(bindings),
                          ])
                      ),
                  }
                : {}),
        };
    },

    replaceMacros: (payload) => {
        set((state) => ({
            ...state,
            macros: buildMacroState(payload),
            runtimeMeta: markDirty(state, 'updateMacros'),
        }));
    },

    replaceGraph: (graph) => {
        set((state) => {
            const validation = validateSceneGraph(graph, Object.keys(state.elements));
            if (!validation.ok) {
                throw new Error(`SceneStore.replaceGraph: ${validation.errors[0]?.message ?? 'invalid graph'}`);
            }
            const next = cloneSceneGraph(graph);
            next.revision = Math.max(state.graph.revision + 1, next.revision);
            return { ...state, ...graphIndexes(next), runtimeMeta: markDirty(state, 'replaceGraph') };
        });
    },

    updateNodeTransform: (nodeId, transform) => {
        set((state) => {
            const current = state.graph.nodesById[nodeId];
            if (!current || current.kind === 'root') return state;
            const userNodeTransform = { ...current.userNodeTransform, ...transform };
            if (Object.values(userNodeTransform).some((value) => !Number.isFinite(value))) {
                throw new Error('SceneStore.updateNodeTransform: transform values must be finite');
            }
            const graph = cloneSceneGraph(state.graph);
            graph.nodesById[nodeId] = { ...graph.nodesById[nodeId], userNodeTransform } as typeof current;
            graph.revision += 1;
            return { ...state, ...graphIndexes(graph), runtimeMeta: markDirty(state, 'updateNodeTransform') };
        });
    },

    setNodeVisibility: (nodeId, visible) => {
        set((state) => {
            const current = state.graph.nodesById[nodeId];
            if (!current || current.kind === 'root' || current.localVisible === visible) return state;
            const graph = cloneSceneGraph(state.graph);
            graph.nodesById[nodeId] = { ...graph.nodesById[nodeId], localVisible: visible } as typeof current;
            graph.revision += 1;
            const elementId = current.kind === 'element' ? current.elementId : null;
            return {
                ...state,
                ...graphIndexes(graph),
                interaction:
                    !visible && elementId
                        ? {
                              ...state.interaction,
                              hoveredElementId:
                                  state.interaction.hoveredElementId === elementId
                                      ? null
                                      : state.interaction.hoveredElementId,
                              editingElementId:
                                  state.interaction.editingElementId === elementId
                                      ? null
                                      : state.interaction.editingElementId,
                          }
                        : state.interaction,
                runtimeMeta: markDirty(state, 'setNodeVisibility'),
            };
        });
    },

    setNodeLocked: (nodeId, locked) => {
        set((state) => {
            const current = state.graph.nodesById[nodeId];
            if (!current || current.kind === 'root' || current.localLocked === locked) return state;
            const graph = cloneSceneGraph(state.graph);
            graph.nodesById[nodeId] = { ...graph.nodesById[nodeId], localLocked: locked } as typeof current;
            graph.revision += 1;
            const elementId = current.kind === 'element' ? current.elementId : null;
            return {
                ...state,
                ...graphIndexes(graph),
                interaction:
                    locked && elementId
                        ? {
                              ...state.interaction,
                              hoveredElementId:
                                  state.interaction.hoveredElementId === elementId
                                      ? null
                                      : state.interaction.hoveredElementId,
                              editingElementId:
                                  state.interaction.editingElementId === elementId
                                      ? null
                                      : state.interaction.editingElementId,
                          }
                        : state.interaction,
                runtimeMeta: markDirty(state, 'setNodeLocked'),
            };
        });
    },

    setNodeName: (nodeId, name) => {
        set((state) => {
            const current = state.graph.nodesById[nodeId];
            const trimmed = name.trim();
            if (!current || current.kind === 'root' || !trimmed || current.name === trimmed) return state;
            const graph = cloneSceneGraph(state.graph);
            graph.nodesById[nodeId] = { ...graph.nodesById[nodeId], name: trimmed } as typeof current;
            graph.revision += 1;
            return { ...state, ...graphIndexes(graph), runtimeMeta: markDirty(state, 'replaceGraph') };
        });
    },

    setInteractionState: (patch) => {
        set((state) => {
            const next: SceneInteractionState = { ...state.interaction };

            if ('hoveredElementId' in patch) {
                const hovered = patch.hoveredElementId ?? null;
                const resolved = hovered && state.elements[hovered] ? hovered : null;
                if (resolved !== next.hoveredElementId) {
                    next.hoveredElementId = resolved;
                }
            }

            if ('editingElementId' in patch) {
                const editing = patch.editingElementId ?? null;
                const resolved = editing && state.elements[editing] ? editing : null;
                if (resolved !== next.editingElementId) {
                    next.editingElementId = resolved;
                }
            }

            if ('clipboard' in patch) {
                const clipboard = patch.clipboard ?? null;
                const shouldUpdate =
                    (!clipboard && next.clipboard !== null) ||
                    (clipboard && (!next.clipboard || clipboard !== next.clipboard));
                if (shouldUpdate) {
                    next.clipboard = clipboard;
                }
            }

            if (
                next.hoveredElementId === state.interaction.hoveredElementId &&
                next.editingElementId === state.interaction.editingElementId &&
                next.clipboard === state.interaction.clipboard
            ) {
                return state;
            }

            return {
                ...state,
                interaction: next,
            };
        });
    },

    setPropertyGroupCollapseState: (elementId, groupId, collapsed) => {
        set((state) => ({
            ...state,
            interaction: {
                ...state.interaction,
                expandedPropertyGroups: {
                    ...state.interaction.expandedPropertyGroups,
                    [elementId]: {
                        ...(state.interaction.expandedPropertyGroups[elementId] ?? {}),
                        [groupId]: collapsed,
                    },
                },
            },
        }));
    },

    setActivePropertyTab: (elementId, tabId) => {
        set((state) => ({
            ...state,
            interaction: {
                ...state.interaction,
                activePropertyTab: {
                    ...state.interaction.activePropertyTab,
                    [elementId]: tabId,
                },
            },
        }));
    },

    setPropertyClipboard: (clipboard) => {
        set((state) => ({
            ...state,
            interaction: {
                ...state.interaction,
                propertyClipboard: clipboard,
            },
        }));
    },

    setAutomationChannel: (channel) => {
        set((state) => ({
            ...state,
            automation: {
                channels: { ...state.automation.channels, [channel.id]: channel },
                channelIdByTarget: {
                    ...state.automation.channelIdByTarget,
                    [encodePropertyTarget(channel.target)]: channel.id,
                },
            },
            runtimeMeta: markDirty(state, 'updateAutomation'),
        }));
    },

    removeAutomationChannel: (channelId) => {
        automationEvaluator.invalidateChannel(channelId);
        set((state) => {
            const { [channelId]: _removed, ...remaining } = state.automation.channels;
            return {
                ...state,
                automation: { channels: remaining, channelIdByTarget: rebuildAutomationTargetIndex(remaining) },
                runtimeMeta: markDirty(state, 'updateAutomation'),
            };
        });
    },

    updateAutomationKeyframes: (channelId, keyframes) => {
        automationEvaluator.invalidateChannel(channelId);
        set((state) => {
            const channel = state.automation.channels[channelId];
            if (!channel) return state;
            return {
                ...state,
                automation: {
                    channels: {
                        ...state.automation.channels,
                        [channelId]: { ...channel, keyframes },
                    },
                    channelIdByTarget: state.automation.channelIdByTarget,
                },
                runtimeMeta: markDirty(state, 'updateAutomation'),
            };
        });
    },

    setPropertyOverride: (channelId, value) => {
        set((state) => ({
            ...state,
            propertyOverrides: { ...state.propertyOverrides, [channelId]: value },
        }));
    },

    clearPropertyOverride: (channelId) => {
        set((state) => {
            if (!(channelId in state.propertyOverrides)) return state;
            const next = { ...state.propertyOverrides };
            delete next[channelId];
            return { ...state, propertyOverrides: next };
        });
    },

    clearAllPropertyOverrides: () => {
        set((state) => {
            if (Object.keys(state.propertyOverrides).length === 0) return state;
            return { ...state, propertyOverrides: {} };
        });
    },
});

const sceneStoreCreator: StateCreator<SceneStoreState> = (set, get) => createSceneStoreState(set, get);

export const createSceneStore = () => createWithEqualityFn<SceneStoreState>(sceneStoreCreator);

export const useSceneStore = createSceneStore();

// Wire the automation evaluator's channel provider to the store so it can
// resolve channels without relying on CommonJS require (which fails in Vite ESM).
automationEvaluator.setChannelProvider((channelId) => useSceneStore.getState().automation.channels[channelId]);

// Clear transient property overrides when the playhead moves so keyframed values
// take over again (Blender-style delink: manually changed values persist only until scrub/play).
{
    let _lastOverrideClearTick: number | null = null;
    useTimelineStore.subscribe((state) => {
        const tick = state.timeline.currentTick;
        if (tick !== _lastOverrideClearTick) {
            _lastOverrideClearTick = tick;
            useSceneStore.getState().clearAllPropertyOverrides();
        }
    });
}
