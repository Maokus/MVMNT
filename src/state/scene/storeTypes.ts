import type { AutomationChannel, AutomationKeyframe, AutomationState, KeyframesBindingState } from '@automation/types';
import type { NodeTransform, SceneGraphState } from '@state/scene-graph';
import type { FontAsset } from '@fonts/types';
import type { Macro } from './macros';

/** Leaf scene-document contracts. This module must never import a store facade. */
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
export type ElementBindingsPatch = Record<string, BindingState | null | undefined>;

export interface MacroTargetAssignment {
    target: import('@automation/types').PropertyTarget;
}

export type MacroBindingsIndex = Record<string, MacroTargetAssignment[]>;

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

export interface SceneMacroState {
    byId: Record<string, Macro>;
    allIds: string[];
    exportedAt?: number;
}

export interface SceneBindingsState {
    byElement: Record<string, ElementBindings>;
    byMacro: MacroBindingsIndex;
}

export interface SceneFontsState {
    assets: Record<string, FontAsset>;
    order: string[];
    totalBytes: number;
    licensingAcknowledgedAt?: number;
}

export interface SceneSerializedElement {
    id: string;
    type: string;
    properties: Record<string, BindingState>;
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

export interface SceneSnapshot {
    elements: Record<string, SceneSerializedElement>;
    graph: SceneGraphState;
    elementErrors?: Array<{ id: string; type: string; message: string }>;
    sceneSettings: SceneSettingsState;
    macros?: SceneSerializedMacros;
    fontAssets?: Record<string, FontAsset>;
    fontLicensingAcknowledgedAt?: number;
    automation?: AutomationState;
    nodeBindings?: Record<string, ElementBindings>;
}

export type SceneStoreComputedExport = SceneSnapshot;

export interface SceneImportPayload {
    elements?: SceneSerializedElement[] | Record<string, SceneSerializedElement>;
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
    | 'setNodeOpacity'
    | 'setNodeOutputBlendMode'
    | 'setNodeLocked'
    | 'importScene';

export interface SceneRuntimeMeta {
    schemaVersion: number;
    initializedAt: number;
    lastHydratedAt?: number;
    lastMutationSource?: SceneMutationSource;
    lastMutatedAt?: number;
    persistentDirty: boolean;
    hasInitializedScene: boolean;
}

export interface SceneStoreActions {
    addElement(input: SceneElementInput): void;
    moveElement(elementId: string, targetIndex: number): void;
    duplicateElement(sourceId: string, newId: string, opts?: { insertAfter?: boolean }): void;
    removeElement(elementId: string): void;
    updateElementId(currentId: string, nextId: string): void;
    updateSettings(patch: Partial<SceneSettingsState>): void;
    updateBindings(elementId: string, patch: ElementBindingsPatch): void;
    updateNodeBindings(nodeId: string, patch: ElementBindingsPatch): void;
    removeNodeBindings(nodeIds: string[]): void;
    createMacro(macroId: string, definition: SceneMacroDefinition): void;
    updateMacroValue(macroId: string, value: unknown): void;
    renameMacro(currentId: string, nextId: string): void;
    reorderMacros(order: string[]): void;
    deleteMacro(macroId: string): void;
    registerFontAsset(asset: FontAsset): void;
    updateFontAsset(assetId: string, patch: Partial<Omit<FontAsset, 'id'>>): void;
    deleteFontAsset(assetId: string): void;
    acknowledgeFontLicensing(timestamp?: number): void;
    clearScene(): void;
    importScene(payload: SceneImportPayload): void;
    exportSceneDraft(): SceneSnapshot;
    replaceMacros(payload: SceneSerializedMacros | null | undefined): void;
    setAutomationChannel(channel: AutomationChannel): void;
    removeAutomationChannel(channelId: string): void;
    updateAutomationKeyframes(channelId: string, keyframes: AutomationKeyframe[]): void;
    replaceGraph(graph: SceneGraphState): void;
    updateNodeTransform(nodeId: string, transform: Partial<NodeTransform>): void;
    setNodeVisibility(nodeId: string, visible: boolean): void;
    setNodeOpacity(nodeId: string, opacity: number): void;
    setNodeOutputBlendMode(nodeId: string, mode: import('@utils/blend-modes').ElementOutputBlendMode): void;
    setNodeLocked(nodeId: string, locked: boolean): void;
    setNodeName(nodeId: string, name: string): void;
}

export interface SceneDocumentState {
    settings: SceneSettingsState;
    elements: Record<string, SceneElementRecord>;
    graph: SceneGraphState;
    nodeIdByElementId: Record<string, string>;
    elementIdByNodeId: Record<string, string>;
    bindings: SceneBindingsState;
    macros: SceneMacroState;
    fonts: SceneFontsState;
    automation: AutomationState;
    nodeBindings: Record<string, ElementBindings>;
}

/** Legacy composite while command mutations are migrated behind the gateway. */
export interface SceneStoreState extends SceneDocumentState, SceneStoreActions {
    runtimeMeta: SceneRuntimeMeta;
}
