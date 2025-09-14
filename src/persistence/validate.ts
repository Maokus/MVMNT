/**
 * Phase 1 validation: fatal-only structural checks.
 * Fatal Conditions:
 *  - Root must be object
 *  - schemaVersion === 1
 *  - format === 'mvmnt.scene'
 *  - metadata.id/name present (string)
 *  - scene.elements is array (even if empty)
 *  - timeline is object with required keys (timeline, tracks, tracksOrder)
 *  - tracksOrder must be an array of strings; referenced IDs must exist in tracks
 *  - Duplicate element IDs in scene.elements (if id present) are fatal
 */
export interface ValidationError {
    message: string;
    path?: string;
}
export interface ValidationWarning {
    message: string;
    path?: string;
}
export interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export function validateSceneEnvelope(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof data !== 'object' || data === null) {
        return { ok: false, errors: [{ message: 'Root must be an object' }], warnings };
    }
    const root: any = data;
    if (root.schemaVersion !== 1) {
        errors.push({ message: 'Unsupported schemaVersion', path: 'schemaVersion' });
    }
    if (root.format !== 'mvmnt.scene') {
        errors.push({ message: 'Invalid format', path: 'format' });
    }
    if (!root.metadata || typeof root.metadata !== 'object') {
        errors.push({ message: 'Missing metadata object', path: 'metadata' });
    } else {
        if (typeof root.metadata.id !== 'string')
            errors.push({ message: 'metadata.id missing or not string', path: 'metadata.id' });
        if (typeof root.metadata.name !== 'string')
            errors.push({ message: 'metadata.name missing or not string', path: 'metadata.name' });
    }
    if (!root.scene || typeof root.scene !== 'object') {
        errors.push({ message: 'Missing scene object', path: 'scene' });
    } else {
        if (!Array.isArray(root.scene.elements)) {
            errors.push({ message: 'scene.elements must be array', path: 'scene.elements' });
        } else {
            // Duplicate id detection
            const seen = new Set<string>();
            for (let i = 0; i < root.scene.elements.length; i++) {
                const el = root.scene.elements[i];
                if (el && typeof el === 'object' && typeof el.id === 'string') {
                    if (seen.has(el.id)) {
                        errors.push({ message: 'Duplicate element id ' + el.id, path: 'scene.elements[' + i + '].id' });
                        break; // one duplicate enough for fatal
                    }
                    seen.add(el.id);
                }
            }
        }
    }
    if (!root.timeline || typeof root.timeline !== 'object') {
        errors.push({ message: 'Missing timeline object', path: 'timeline' });
    } else {
        const tl = root.timeline;
        if (!tl.timeline || typeof tl.timeline !== 'object')
            errors.push({ message: 'timeline.timeline missing', path: 'timeline.timeline' });
        if (typeof tl.tracks !== 'object' || tl.tracks === null)
            errors.push({ message: 'timeline.tracks missing', path: 'timeline.tracks' });
        if (!Array.isArray(tl.tracksOrder))
            errors.push({ message: 'timeline.tracksOrder must be array', path: 'timeline.tracksOrder' });
        else {
            for (let i = 0; i < tl.tracksOrder.length; i++) {
                const id = tl.tracksOrder[i];
                if (typeof id !== 'string') {
                    errors.push({ message: 'tracksOrder item not string', path: 'timeline.tracksOrder[' + i + ']' });
                    break;
                }
                if (!tl.tracks || !tl.tracks[id]) {
                    errors.push({
                        message: 'tracksOrder references missing track ' + id,
                        path: 'timeline.tracksOrder[' + i + ']',
                    });
                    break;
                }
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}
