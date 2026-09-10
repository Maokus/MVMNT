import { clearSpectrogramTileCache } from '@core/scene/built-ins/audio-displays/spectrogram-tiles';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { advanceTimelineMutationGeneration, useTimelineStore } from '@state/timelineStore';
import { DocumentGateway } from '../document-gateway';
import { hydrateVisualAssetRegistry, migrateStoreAssetRefBindings } from './assetHydration';
import type { ValidatedCurrentDocument } from './contracts';

export function applyImportedDocument(
    document: ValidatedCurrentDocument,
    fileById: Map<string, File>,
    visualMetadata: unknown,
    persistedRegistry: unknown
): number {
    const previousDocument = DocumentGateway.build({ includeEphemeral: true });
    const previousAssets = useVisualAssetRegistryStore.getState();
    useTimelineStore.getState().pause();
    useVisualAssetRegistryStore.getState()._clear();
    try {
        DocumentGateway.apply(document);
    } catch (error) {
        const rollbackErrors: unknown[] = [];
        try {
            DocumentGateway.apply(previousDocument);
        } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
        }
        try {
            useVisualAssetRegistryStore.setState({
                assets: previousAssets.assets,
                assetsOrder: previousAssets.assetsOrder,
            });
        } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
        }
        if (rollbackErrors.length) {
            throw new AggregateError([error, ...rollbackErrors], 'Document import and rollback failed');
        }
        throw error;
    }
    clearSpectrogramTileCache();
    const generation = advanceTimelineMutationGeneration();
    hydrateVisualAssetRegistry(fileById, visualMetadata as any, persistedRegistry as any);
    migrateStoreAssetRefBindings(fileById);
    return generation;
}
