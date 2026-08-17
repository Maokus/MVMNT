import { analytics } from './analytics';

export async function runTrackedDocumentSave(
    operation: () => Promise<boolean>,
    saveMode: 'save' | 'save_as'
): Promise<boolean> {
    const saved = await operation();
    if (saved) await analytics.capture('document_saved', { save_mode: saveMode });
    else
        await analytics.capture('document_operation_failed', {
            operation: 'save',
            failure_category: 'save',
        });
    return saved;
}
