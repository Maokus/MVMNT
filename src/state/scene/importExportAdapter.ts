import {
    buildSceneGraphIndexes,
    cloneSceneGraph,
    createFlatSceneGraph,
    deriveElementOrder,
    nodeTransformToMatrix,
    normalizeElementNodeNames,
    validateSceneGraph,
    type NodeTransform,
} from '@state/scene-graph';
import {
    cloneCurrentAutomationState,
    elementPropertyTarget,
    nodePropertyTarget,
    rebuildAutomationTargetIndex,
} from '@automation/types';
import type { FontAsset } from './fonts';
import type {
    BindingState,
    ElementBindings,
    SceneBindingsState,
    SceneElementRecord,
    SceneImportPayload,
    SceneInteractionState,
    SceneMacroState,
    SceneSerializedElement,
    SceneSerializedMacros,
    SceneSettingsState,
    SceneStoreComputedExport,
    SceneStoreState,
} from './storeTypes';
import { createSceneSnapshot } from './snapshot';

export interface NormalizedSceneImportPayload extends Omit<SceneImportPayload, 'elements' | 'graph'> {
    elements: SceneSerializedElement[];
    graph: NonNullable<SceneImportPayload['graph']>;
}

export interface SceneImportNormalizationContext {
    defaultSettings: SceneSettingsState;
    deserializeElementBindings: (element: SceneSerializedElement) => ElementBindings;
    cloneBinding: (binding: BindingState) => BindingState;
    readBindingNumber: (binding: BindingState | undefined) => number | null;
    rebuildMacroIndex: (
        byElement: Record<string, ElementBindings>,
        byNode: Record<string, ElementBindings>
    ) => SceneBindingsState['byMacro'];
    buildMacroState: (payload?: SceneSerializedMacros | null) => SceneMacroState;
    normalizeFontAssetInput: (input: FontAsset, existing?: FontAsset) => FontAsset;
    computeFontBytes: (assets: Record<string, FontAsset>) => number;
    createInitialInteractionState: () => SceneInteractionState;
    graphIndexes: (
        graph: SceneStoreState['graph']
    ) => Pick<SceneStoreState, 'graph' | 'nodeIdByElementId' | 'elementIdByNodeId'>;
}

/**
 * Normalizes the two accepted in-memory element shapes before slice hydration.
 * Released-file migrations remain in persistence; this adapter handles only the
 * scene-store boundary and deliberately preserves graph order.
 */
export function normalizeSceneImportPayload(payload: SceneImportPayload): NormalizedSceneImportPayload {
    let elements: SceneSerializedElement[];
    if (Array.isArray(payload.elements)) {
        elements = payload.elements;
    } else if (payload.elements && typeof payload.elements === 'object') {
        const elementsById = payload.elements as Record<string, SceneSerializedElement>;
        elements = payload.graph
            ? deriveElementOrder(payload.graph)
                  .map((id) => elementsById[id])
                  .filter((element): element is SceneSerializedElement => Boolean(element))
            : Object.values(elementsById);
    } else {
        elements = [];
    }

    const elementIds = elements
        .filter((element): element is SceneSerializedElement =>
            Boolean(element && typeof element.id === 'string' && typeof element.type === 'string')
        )
        .map((element) => element.id);

    return {
        ...payload,
        elements,
        graph: cloneSceneGraph(payload.graph ?? createFlatSceneGraph(elementIds)),
    };
}

/** Compatibility implementation behind SceneStore.exportSceneDraft. */
export function exportSceneDraft(state: SceneStoreState): SceneStoreComputedExport {
    return createSceneSnapshot(state);
}

export function normalizeSceneImportState(
    state: SceneStoreState,
    input: SceneImportPayload,
    context: SceneImportNormalizationContext
): SceneStoreState {
    const payload = normalizeSceneImportPayload(input);
    const {
        defaultSettings: DEFAULT_SCENE_SETTINGS,
        deserializeElementBindings,
        cloneBinding,
        readBindingNumber,
        rebuildMacroIndex,
        buildMacroState,
        normalizeFontAssetInput,
        computeFontBytes,
        createInitialInteractionState,
        graphIndexes,
    } = context;
    const elements = payload.elements;

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
        delete nextByElement[el.id].zIndex;
    }

    const incomingGraph = normalizeElementNodeNames(cloneSceneGraph(payload.graph));
    for (const node of Object.values(incomingGraph.nodesById)) {
        const transform = node.userNodeTransform as NodeTransform & { uniformScale?: number };
        const oldUniformScale =
            typeof transform.uniformScale === 'number' && Number.isFinite(transform.uniformScale)
                ? transform.uniformScale
                : 1;
        if (typeof transform.scaleX !== 'number') transform.scaleX = oldUniformScale;
        if (typeof transform.scaleY !== 'number') transform.scaleY = oldUniformScale;
        delete transform.uniformScale;
        if (typeof node.localOpacity !== 'number') node.localOpacity = 1;
    }
    const graphValidation = validateSceneGraph(incomingGraph, Object.keys(nextElements));
    if (!graphValidation.ok) {
        throw new Error(`SceneStore.importScene: invalid scene graph (${graphValidation.errors[0]?.message})`);
    }
    const nextGraph = incomingGraph;

    const automation = cloneCurrentAutomationState(payload.automation);
    const nextNodeBindings: Record<string, ElementBindings> = {};
    for (const [nodeId, bindings] of Object.entries(payload.nodeBindings ?? {})) {
        if (!nextGraph.nodesById[nodeId] || !bindings) continue;
        nextNodeBindings[nodeId] = Object.fromEntries(
            Object.entries(bindings).map(([path, binding]) => [path, cloneBinding(binding)])
        );
    }

    // Offset bindings predate host-owned node position. Move them at the store boundary so
    // imported scenes retain their appearance without reintroducing the retired properties
    // into runtime elements or future exports.
    const importedIndexes = buildSceneGraphIndexes(nextGraph);
    for (const elementId of nextOrder) {
        const bindings = nextByElement[elementId];
        const nodeId = importedIndexes.nodeIdByElementId[elementId];
        const node = nodeId ? nextGraph.nodesById[nodeId] : undefined;
        if (!bindings || !node || node.kind !== 'element') continue;
        const offsetX = bindings.offsetX;
        const offsetY = bindings.offsetY;
        delete bindings.offsetX;
        delete bindings.offsetY;
        const elementRotation = bindings.elementRotation;
        delete bindings.elementRotation;
        const anchorX = bindings.anchorX;
        const anchorY = bindings.anchorY;
        delete bindings.anchorX;
        delete bindings.anchorY;
        const textAnchorX = bindings.textAnchorX;
        const textAnchorY = bindings.textAnchorY;
        delete bindings.textAnchorX;
        delete bindings.textAnchorY;

        const elementOpacity = bindings.elementOpacity;
        const elementScaleX = bindings.elementScaleX;
        const elementScaleY = bindings.elementScaleY;
        delete bindings.elementOpacity;
        delete bindings.elementScaleX;
        delete bindings.elementScaleY;

        let nodeBindings = nextNodeBindings[nodeId];
        const moveBinding = (source: BindingState | undefined, path: string) => {
            if (!source) return;
            nodeBindings ??= nextNodeBindings[nodeId] = {};
            nodeBindings[path] = cloneBinding(source);
            if (source.type === 'keyframes') {
                const channel = automation.channels[source.channelId];
                if (channel)
                    automation.channels[source.channelId] = {
                        ...channel,
                        target: nodePropertyTarget(nodeId, path),
                    };
            }
        };

        const moveContentAnchor = (source: BindingState | undefined, path: 'contentAnchorX' | 'contentAnchorY') => {
            if (!source || bindings[path]) return;
            bindings[path] = cloneBinding(source);
            if (source.type === 'keyframes') {
                const channel = automation.channels[source.channelId];
                if (channel)
                    automation.channels[source.channelId] = {
                        ...channel,
                        target: elementPropertyTarget(elementId, path),
                    };
            }
        };

        // The retired element anchor and text-only anchor both selected
        // a normalized point in the wrapper's layout bounds. They now
        // map directly to the shared content anchor for every element.
        moveContentAnchor(textAnchorX ?? anchorX, 'contentAnchorX');
        moveContentAnchor(textAnchorY ?? anchorY, 'contentAnchorY');

        // Files opened by the previous compatibility layer may already
        // have the old anchor on their host node. Move that state back
        // to the element, including animated node bindings.
        const legacyTransform = node.userNodeTransform as NodeTransform & {
            legacyAnchorX?: number;
            legacyAnchorY?: number;
        };
        const legacyAnchorX = legacyTransform.legacyAnchorX;
        const legacyAnchorY = legacyTransform.legacyAnchorY;
        delete legacyTransform.legacyAnchorX;
        delete legacyTransform.legacyAnchorY;
        moveContentAnchor(
            nodeBindings?.legacyAnchorX ??
                (Number.isFinite(legacyAnchorX)
                    ? ({ type: 'constant', value: legacyAnchorX } satisfies BindingState)
                    : undefined),
            'contentAnchorX'
        );
        moveContentAnchor(
            nodeBindings?.legacyAnchorY ??
                (Number.isFinite(legacyAnchorY)
                    ? ({ type: 'constant', value: legacyAnchorY } satisfies BindingState)
                    : undefined),
            'contentAnchorY'
        );
        if (nodeBindings) {
            delete nodeBindings.legacyAnchorX;
            delete nodeBindings.legacyAnchorY;
        }

        if (elementOpacity) {
            const opacity = readBindingNumber(elementOpacity);
            if (opacity != null) node.localOpacity = Math.max(0, Math.min(1, opacity));
            else moveBinding(elementOpacity, 'localOpacity');
        }

        const oldUniformBinding = nodeBindings?.uniformScale;
        if (nodeBindings) delete nodeBindings.uniformScale;
        const scalesAreDynamic = [oldUniformBinding, elementScaleX, elementScaleY].some(
            (binding) => binding && binding.type !== 'constant'
        );
        const contentScaleX = readBindingNumber(elementScaleX) ?? 1;
        const contentScaleY = readBindingNumber(elementScaleY) ?? 1;
        const baseScaleX = node.userNodeTransform.scaleX;
        const baseScaleY = node.userNodeTransform.scaleY;
        const hasUsableBaseScale =
            Number.isFinite(baseScaleX) &&
            Number.isFinite(baseScaleY) &&
            Math.abs(baseScaleX) > 1e-10 &&
            Math.abs(baseScaleY) > 1e-10;
        if (!scalesAreDynamic && hasUsableBaseScale && contentScaleX !== 0 && contentScaleY !== 0) {
            const cosine = Math.cos(node.userNodeTransform.rotation);
            const sine = Math.sin(node.userNodeTransform.rotation);
            node.userNodeTransform.translationX +=
                cosine * baseScaleX * (contentScaleX - 1) * node.userNodeTransform.pivotX -
                sine * baseScaleY * (contentScaleY - 1) * node.userNodeTransform.pivotY;
            node.userNodeTransform.translationY +=
                sine * baseScaleX * (contentScaleX - 1) * node.userNodeTransform.pivotX +
                cosine * baseScaleY * (contentScaleY - 1) * node.userNodeTransform.pivotY;
            node.userNodeTransform.scaleX = baseScaleX * contentScaleX;
            node.userNodeTransform.scaleY = baseScaleY * contentScaleY;
        } else if (oldUniformBinding || elementScaleX || elementScaleY) {
            node.userNodeTransform.scaleX = 1;
            node.userNodeTransform.scaleY = 1;
            node.userNodeTransform.legacyUniformScale = readBindingNumber(oldUniformBinding) ?? 1;
            node.userNodeTransform.legacyContentScaleX = contentScaleX;
            node.userNodeTransform.legacyContentScaleY = contentScaleY;
            moveBinding(oldUniformBinding, 'legacyUniformScale');
            moveBinding(elementScaleX, 'legacyContentScaleX');
            moveBinding(elementScaleY, 'legacyContentScaleY');
        }

        if (offsetX || offsetY) {
            const matrix = nodeTransformToMatrix(node.userNodeTransform);
            const constantX = readBindingNumber(offsetX) ?? 0;
            const constantY = readBindingNumber(offsetY) ?? 0;
            node.userNodeTransform.translationX += matrix[0] * constantX + matrix[2] * constantY;
            node.userNodeTransform.translationY += matrix[1] * constantX + matrix[3] * constantY;

            const canMoveDynamicBindings =
                Math.abs(matrix[0] - 1) < 1e-8 &&
                Math.abs(matrix[1]) < 1e-8 &&
                Math.abs(matrix[2]) < 1e-8 &&
                Math.abs(matrix[3] - 1) < 1e-8;
            if (canMoveDynamicBindings) {
                const nodeBindings = (nextNodeBindings[nodeId] ??= {});
                for (const [path, binding] of [
                    ['translationX', offsetX],
                    ['translationY', offsetY],
                ] as const) {
                    if (!binding || binding.type === 'constant' || nodeBindings[path]) continue;
                    nodeBindings[path] = cloneBinding(binding);
                    if (binding.type === 'keyframes') {
                        const channel = automation.channels[binding.channelId];
                        if (channel) {
                            automation.channels[binding.channelId] = {
                                ...channel,
                                target: nodePropertyTarget(nodeId, path),
                            };
                        }
                    }
                }
            }
        }

        const rotationDegrees = readBindingNumber(elementRotation);
        if (rotationDegrees != null) {
            node.userNodeTransform.rotation += (rotationDegrees * Math.PI) / 180;
        } else if (elementRotation?.type === 'keyframes') {
            const channel = automation.channels[elementRotation.channelId];
            const nodeBindings = (nextNodeBindings[nodeId] ??= {});
            if (channel && !nodeBindings.rotation) {
                nodeBindings.rotation = cloneBinding(elementRotation);
                automation.channels[elementRotation.channelId] = {
                    ...channel,
                    target: nodePropertyTarget(nodeId, 'rotation'),
                    keyframes: channel.keyframes.map((keyframe) => ({
                        ...keyframe,
                        value: typeof keyframe.value === 'number' ? (keyframe.value * Math.PI) / 180 : keyframe.value,
                    })),
                };
            }
        }
    }
    automation.channelIdByTarget = rebuildAutomationTargetIndex(automation.channels);

    const nextBindings: SceneBindingsState = {
        byElement: nextByElement,
        byMacro: rebuildMacroIndex(nextByElement, nextNodeBindings),
    };

    const nextSettings = {
        ...DEFAULT_SCENE_SETTINGS,
        ...(payload.sceneSettings ?? {}),
    } satisfies SceneSettingsState;

    const importTimestamp = Date.now();

    const normalizedFontAssets: Record<string, FontAsset> = {};
    if (payload.fontAssets) {
        for (const [assetId, asset] of Object.entries(payload.fontAssets)) {
            if (!assetId || !asset) continue;
            const id = typeof asset.id === 'string' ? asset.id : assetId;
            normalizedFontAssets[id] = normalizeFontAssetInput({ ...asset, id } as FontAsset);
        }
    }
    const fontOrder = Object.keys(normalizedFontAssets);
    const fontLicensingAcknowledgedAt =
        typeof payload.fontLicensingAcknowledgedAt === 'number' ? payload.fontLicensingAcknowledgedAt : undefined;

    return {
        ...state,
        settings: nextSettings,
        elements: nextElements,
        ...graphIndexes(nextGraph),
        bindings: nextBindings,
        macros: buildMacroState(payload.macros),
        fonts: {
            assets: normalizedFontAssets,
            order: fontOrder,
            totalBytes: computeFontBytes(normalizedFontAssets),
            licensingAcknowledgedAt: fontLicensingAcknowledgedAt,
        },
        interaction: createInitialInteractionState(),
        automation,
        nodeBindings: nextNodeBindings,
        transientNodeTransforms: {},
        runtimeMeta: {
            ...state.runtimeMeta,
            persistentDirty: false,
            lastHydratedAt: importTimestamp,
            lastMutationSource: 'importScene',
            lastMutatedAt: importTimestamp,
            hasInitializedScene: true,
        },
    };
}
