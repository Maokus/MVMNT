import type { PropertyBindingData } from '@bindings/property-bindings';
import { cloneSceneGraph, deriveElementOrder } from '@state/scene-graph';
import type { FontAsset } from './fonts';
import type {
    BindingState,
    ElementBindings,
    SceneSerializedElement,
    SceneStoreComputedExport,
    SceneStoreState,
} from './storeTypes';

/** Canonical persistent representation of the scene store. */
export type SceneSnapshot = SceneStoreComputedExport;

function cloneBinding(binding: BindingState): BindingState {
    if (binding.type === 'constant') return { type: 'constant', value: structuredClone(binding.value) };
    if (binding.type === 'macro') return { type: 'macro', macroId: binding.macroId };
    return { type: 'keyframes', channelId: binding.channelId };
}

function cloneBindings(bindings: ElementBindings): ElementBindings {
    return Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, cloneBinding(binding)]));
}

function cloneFontAsset(asset: FontAsset): FontAsset {
    return {
        ...asset,
        variants: asset.variants.map((variant) => ({
            ...variant,
            variationSettings: variant.variationSettings ? { ...variant.variationSettings } : undefined,
        })),
    };
}

function serializeElement(id: string, type: string, bindings: ElementBindings): SceneSerializedElement {
    const properties: Record<string, PropertyBindingData> = {};
    for (const [key, binding] of Object.entries(bindings)) {
        if (key === 'zIndex') continue;
        if (binding.type === 'constant') properties[key] = { type: 'constant', value: structuredClone(binding.value) };
        else if (binding.type === 'macro') properties[key] = { type: 'macro', macroId: binding.macroId };
        else properties[key] = { type: 'keyframes', channelId: binding.channelId };
    }
    return { id, type, properties };
}

/**
 * The sole persistent scene boundary used by undo, rollback, document export,
 * recovery, and subtree transfer. Runtime state and interaction state are omitted.
 */
export function createSceneSnapshot(state: SceneStoreState): SceneSnapshot {
    const elements: Record<string, SceneSerializedElement> = {};
    const elementErrors: Array<{ id: string; type: string; message: string }> = [];
    for (const id of deriveElementOrder(state.graph)) {
        const element = state.elements[id];
        if (!element) continue;
        try {
            elements[id] = serializeElement(id, element.type, state.bindings.byElement[id] ?? {});
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            elementErrors.push({ id, type: element.type, message });
            console.warn(`[createSceneSnapshot] Failed to serialize element ${id} (${element.type}):`, error);
        }
    }
    const fontAssets = Object.fromEntries(
        state.fonts.order.flatMap((id) => {
            const asset = state.fonts.assets[id];
            return asset ? [[id, cloneFontAsset(asset)]] : [];
        })
    ) as Record<string, FontAsset>;
    const automation = Object.keys(state.automation.channels).length
        ? { channels: structuredClone(state.automation.channels) }
        : undefined;
    const nodeBindings = Object.keys(state.nodeBindings).length
        ? Object.fromEntries(Object.entries(state.nodeBindings).map(([id, bindings]) => [id, cloneBindings(bindings)]))
        : undefined;
    return {
        elements,
        graph: cloneSceneGraph(state.graph),
        ...(elementErrors.length ? { elementErrors } : {}),
        sceneSettings: { ...state.settings },
        macros: structuredClone({
            macros: state.macros.byId,
            allIds: state.macros.allIds,
            exportedAt: state.macros.exportedAt,
        }),
        ...(Object.keys(fontAssets).length ? { fontAssets } : {}),
        ...(typeof state.fonts.licensingAcknowledgedAt === 'number'
            ? { fontLicensingAcknowledgedAt: state.fonts.licensingAcknowledgedAt }
            : {}),
        ...(automation ? { automation } : {}),
        ...(nodeBindings ? { nodeBindings } : {}),
    };
}
