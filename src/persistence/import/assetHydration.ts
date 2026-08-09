import { isMidiBinary } from '@core/midi/midi-encoder';
import { parseMIDIArrayBuffer } from '@core/midi/midi-library';
import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
import { decodeSceneText } from '../scene-package';
import { useVisualAssetRegistryStore, type ProjectAsset } from '@state/visualAssetRegistryStore';
import { useSceneStore } from '@state/sceneStore';
import { throwIfImportAborted as throwIfAborted } from '../import-abort';
import type { ImportSceneOptions } from './contracts';

export async function restoreMidiCache(
    midiSection: any,
    midiPayloads: Map<string, Uint8Array>,
    options: ImportSceneOptions = {}
): Promise<{ cache: Record<string, any>; warnings: string[] }> {
    if (!midiSection || typeof midiSection !== 'object') {
        return { cache: {}, warnings: [] };
    }
    const restored: Record<string, any> = {};
    const warnings: string[] = [];
    for (const [cacheId, value] of Object.entries(midiSection)) {
        throwIfAborted(options.signal);
        if (!value || typeof value !== 'object') {
            restored[cacheId] = value;
            continue;
        }
        const assetRef = (value as any).assetRef;
        if (typeof assetRef !== 'string') {
            restored[cacheId] = value;
            continue;
        }
        const assetId =
            typeof (value as any).assetId === 'string' ? (value as any).assetId : encodeURIComponent(cacheId);
        const payload = midiPayloads.get(assetId);
        if (!payload) {
            warnings.push(`Missing MIDI payload for cache ${cacheId}`);
            continue;
        }
        if (isMidiBinary(payload)) {
            try {
                const buffer = payload.buffer.slice(
                    payload.byteOffset,
                    payload.byteOffset + payload.byteLength
                ) as ArrayBuffer;
                const midiData = await parseMIDIArrayBuffer(buffer);
                restored[cacheId] = buildNotesFromMIDI(midiData);
            } catch (error) {
                warnings.push(`Failed to parse binary MIDI for cache ${cacheId}: ${(error as Error).message}`);
            }
        } else {
            try {
                const parsed = JSON.parse(decodeSceneText(payload));
                restored[cacheId] = parsed;
            } catch (error) {
                warnings.push(`Failed to parse MIDI payload for cache ${cacheId}: ${(error as Error).message}`);
            }
        }
    }
    return { cache: restored, warnings };
}

/**
 * Restore visual assets from ZIP payloads.
 *
 * For each asset ID recorded in `envelope.assets.visual.byId`, reconstruct a
 * File object from the ZIP bytes. Then scan all element property bindings in
 * `doc.scene` for constant values that match a known asset ID and replace them
 * with the reconstructed File. This runs before DocumentGateway.apply() so that
 * the scene store receives File values it already understands at runtime.
 */
export function restoreVisualAssets(
    scene: any,
    visualAssetsSection: { byId: Record<string, any> } | undefined,
    visualPayloads: Map<string, Uint8Array>,
    options: ImportSceneOptions = {}
): { warnings: string[]; fileById: Map<string, File> } {
    const warnings: string[] = [];
    const fileById = new Map<string, File>();
    if (!visualAssetsSection?.byId || typeof visualAssetsSection.byId !== 'object') return { warnings, fileById };

    // Build a map of assetId → reconstructed File
    for (const [assetId, record] of Object.entries(visualAssetsSection.byId)) {
        throwIfAborted(options.signal);
        if (!record || typeof record !== 'object') continue;
        const bytes = visualPayloads.get(assetId);
        if (!bytes) {
            warnings.push(`Missing visual asset payload for ${assetId}`);
            continue;
        }
        const mimeType = typeof record.mimeType === 'string' ? record.mimeType : 'application/octet-stream';
        const originalFileName =
            typeof record.originalFileName === 'string' ? record.originalFileName : `${assetId}.bin`;
        try {
            const file = new File(
                [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
                originalFileName,
                { type: mimeType }
            );
            fileById.set(assetId, file);
        } catch {
            warnings.push(`Failed to reconstruct File for visual asset ${assetId}`);
        }
    }

    if (fileById.size === 0) return { warnings, fileById };

    // Patch element property bindings: replace asset ID strings with File objects
    // (for prop.file()-type elements; assetRef elements will be migrated back to IDs later)
    const elements = scene?.elements;
    if (!elements || typeof elements !== 'object') return { warnings, fileById };
    for (const element of Object.values(elements) as any[]) {
        if (!element || typeof element !== 'object') continue;
        const props = element.properties;
        if (!props || typeof props !== 'object') continue;
        for (const [propKey, propData] of Object.entries(props) as [string, any][]) {
            if (propData?.type !== 'constant') continue;
            const value = propData.value;
            if (typeof value !== 'string') continue;
            const file = fileById.get(value);
            if (file) {
                props[propKey] = { type: 'constant', value: file };
            }
        }
    }

    return { warnings, fileById };
}

/** Populate the visual asset registry from imported files and optional metadata. */
export function hydrateVisualAssetRegistry(
    fileById: Map<string, File>,
    visualAssetsSection: { byId: Record<string, any> } | undefined,
    registrySection:
        { assets: Record<string, { id: string; name: string; filename: string }>; assetsOrder: string[] } | undefined
): void {
    if (fileById.size === 0) return;

    const entries: ProjectAsset[] = [];
    const orderedIds = registrySection?.assetsOrder?.length ? registrySection.assetsOrder : Array.from(fileById.keys());

    for (const assetId of orderedIds) {
        const file = fileById.get(assetId);
        if (!file) continue;
        const registryMeta = registrySection?.assets?.[assetId];
        const visualMeta = visualAssetsSection?.byId?.[assetId];
        const filename =
            registryMeta?.name ??
            (visualMeta?.originalFileName ? (visualMeta.originalFileName as string).replace(/\.[^.]+$/, '') : null) ??
            assetId;
        const type =
            file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
                ? ('gif' as const)
                : ('image' as const);
        entries.push({
            id: assetId,
            name: filename,
            file,
            type,
            origin: 'user',
            deletable: true,
            visibleInAssetManager: true,
        });
    }

    // Include any IDs not in the ordered list
    for (const [assetId, file] of fileById) {
        if (orderedIds.includes(assetId)) continue;
        const registryMeta = registrySection?.assets?.[assetId];
        const visualMeta = visualAssetsSection?.byId?.[assetId];
        const filename =
            registryMeta?.name ??
            (visualMeta?.originalFileName ? (visualMeta.originalFileName as string).replace(/\.[^.]+$/, '') : null) ??
            assetId;
        const type =
            file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
                ? ('gif' as const)
                : ('image' as const);
        entries.push({
            id: assetId,
            name: filename,
            file,
            type,
            origin: 'user',
            deletable: true,
            visibleInAssetManager: true,
        });
    }

    useVisualAssetRegistryStore.getState()._hydrateFromImport(entries);
}

/**
 * After DocumentGateway.apply(), convert any File objects in scene store bindings
 * back to asset ID strings for assetRef-type properties. Uses the fileById reverse map
 * so we can identify which File corresponds to which registry entry.
 */
export function migrateStoreAssetRefBindings(fileById: Map<string, File>): void {
    if (fileById.size === 0) return;

    // Build File → assetId reverse lookup (same File instances as in the store bindings)
    const fileToId = new Map<File, string>();
    for (const [id, file] of fileById) {
        fileToId.set(file, id);
    }

    const state = useSceneStore.getState();
    const updates: Array<{ elementId: string; propKey: string; assetId: string }> = [];

    for (const [elementId, elementBindings] of Object.entries(state.bindings.byElement)) {
        if (!elementBindings) continue;
        for (const [propKey, binding] of Object.entries(elementBindings)) {
            if (!binding || (binding as any).type !== 'constant') continue;
            const value = (binding as any).value;
            if (!(value instanceof File)) continue;
            const assetId = fileToId.get(value);
            if (assetId) {
                updates.push({ elementId, propKey, assetId });
            }
        }
    }

    if (updates.length === 0) return;

    useSceneStore.setState((prev) => {
        const nextByElement = { ...prev.bindings.byElement };
        for (const { elementId, propKey, assetId } of updates) {
            const elementBindings = nextByElement[elementId];
            if (!elementBindings) continue;
            nextByElement[elementId] = {
                ...elementBindings,
                [propKey]: { type: 'constant', value: assetId },
            };
        }
        return { bindings: { ...prev.bindings, byElement: nextByElement } };
    });
}
