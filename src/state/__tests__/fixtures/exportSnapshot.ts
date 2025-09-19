import { getDocumentSnapshot } from '@state/document/actions';

// Phase P0 helper: capture a snapshot of current document state for baseline comparisons.
// These fixtures are not authoritative for future phases and may be regenerated.
export function exportCurrentDocumentSnapshot() {
    const snap = getDocumentSnapshot();
    return JSON.parse(JSON.stringify(snap));
}
