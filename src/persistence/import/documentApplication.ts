import { clearSpectrogramTileCache } from '@core/scene/elements/audio-displays/spectrogram-tiles';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { advanceTimelineMutationGeneration } from '@state/timelineStore';
import { DocumentGateway } from '../document-gateway';
import { hydrateVisualAssetRegistry, migrateStoreAssetRefBindings } from './assetHydration';

export function applyImportedDocument(
    document: unknown,
    fileById: Map<string, File>,
    visualMetadata: unknown,
    persistedRegistry: unknown
): number {
    useVisualAssetRegistryStore.getState()._clear();
    DocumentGateway.apply(document as any);
    clearSpectrogramTileCache();
    const generation = advanceTimelineMutationGeneration();
    hydrateVisualAssetRegistry(fileById, visualMetadata as any, persistedRegistry as any);
    migrateStoreAssetRefBindings(fileById);
    return generation;
}
