import { measureProjectLoadWork } from '@utils/projectLoadDiagnostics';
import { LocalFileStore } from './local-file-store';
import { LocalSaveService } from './local-save-service';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import type { ImportResultSuccess } from './import/contracts';

/** Reuse immutable incoming bytes unless import or filename reconciliation changed the document. */
export async function saveOpenedProjectRecovery(
    bytes: Uint8Array,
    result: Pick<ImportResultSuccess, 'documentChanged'>,
    sceneName: string,
    originalName = useSceneMetadataStore.getState().metadata.name
): Promise<void> {
    if (result.documentChanged || originalName !== sceneName) {
        const saved = await measureProjectLoadWork('Recovery package rebuild', () =>
            LocalSaveService.saveCurrentFile(sceneName)
        );
        if (!saved.ok) throw new Error(saved.error);
    } else await measureProjectLoadWork('Recovery byte storage', () => LocalFileStore.save(bytes));
}
