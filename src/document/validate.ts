import type { DocumentRoot, Track, TimelineElement } from './schema';

export interface ValidationError {
    path: string; // JSON pointer–like (simplified) path e.g. 'tracks.byId.track1'
    message: string;
    severity?: 'error' | 'warn';
}

// Phase 2: Basic structural & referential validation.
// Focus: root presence, duplicate IDs, element reference integrity (track.elementIds -> elements.byId),
// numeric field sanity (non-negative duration, start >= 0).
// Intentionally lean: no attempt to salvage; we simply report all errors then caller may throw.

export function validateDocument(doc: DocumentRoot): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!doc || typeof doc !== 'object') {
        return [
            {
                path: '',
                message: 'Document is not an object',
                severity: 'error',
            },
        ];
    }

    // Root keys existence (lightweight since migrate should have produced them)
    const requiredRoot: (keyof DocumentRoot)[] = [
        'schemaVersion',
        'createdAt',
        'modifiedAt',
        'tracks',
        'elements',
        'meta',
    ];
    for (const k of requiredRoot) {
        if (!(k in doc)) {
            errors.push({ path: '', message: `Missing root key: ${k}`, severity: 'error' });
        }
    }

    // Tracks & Elements structural expectations
    if (!isCollection(doc.tracks)) {
        errors.push({ path: 'tracks', message: 'Invalid tracks collection shape', severity: 'error' });
    }
    if (!isCollection(doc.elements)) {
        errors.push({ path: 'elements', message: 'Invalid elements collection shape', severity: 'error' });
    }

    // Collect duplicate detection and reference checks only if structures look plausible.
    const trackIdSet = new Set<string>();
    const elementIdSet = new Set<string>();

    // Elements validation
    if (isCollection(doc.elements)) {
        for (const key of doc.elements.allIds) {
            const el = doc.elements.byId[key];
            if (!el) {
                errors.push({
                    path: `elements.byId.${key}`,
                    message: 'Element listed in allIds but missing in byId',
                    severity: 'error',
                });
                continue;
            }
            // Detect duplicate based on actual el.id, not just key.
            if (elementIdSet.has(el.id)) {
                errors.push({ path: `elements.byId.${key}`, message: 'Duplicate element ID', severity: 'error' });
            } else {
                elementIdSet.add(el.id);
            }
            validateElement(el, key, errors);
        }
    }

    // Tracks validation
    if (isCollection(doc.tracks)) {
        for (const key of doc.tracks.allIds) {
            const tr = doc.tracks.byId[key];
            if (!tr) {
                errors.push({
                    path: `tracks.byId.${key}`,
                    message: 'Track listed in allIds but missing in byId',
                    severity: 'error',
                });
                continue;
            }
            if (trackIdSet.has(tr.id)) {
                errors.push({ path: `tracks.byId.${key}`, message: 'Duplicate track ID', severity: 'error' });
            } else {
                trackIdSet.add(tr.id);
            }
            validateTrack(tr, key, elementIdSet, errors);
        }
    }

    return errors;
}

export function assertValidDocument(doc: DocumentRoot): void {
    const errs = validateDocument(doc);
    if (errs.some((e) => (e.severity ?? 'error') === 'error')) {
        const message =
            'Document validation failed:\n' +
            errs.map((e) => `- [${e.severity ?? 'error'}] ${e.path || '<root>'}: ${e.message}`).join('\n');
        throw new Error(message);
    }
}

function isCollection(section: any): section is { byId: Record<string, any>; allIds: string[] } {
    return (
        section &&
        typeof section === 'object' &&
        section.byId &&
        typeof section.byId === 'object' &&
        Array.isArray(section.allIds)
    );
}

function validateElement(el: TimelineElement, id: string, errors: ValidationError[]) {
    if (el.id !== id) {
        errors.push({ path: `elements.byId.${id}.id`, message: 'Element ID mismatch with key', severity: 'error' });
    }
    if (typeof el.start !== 'number' || el.start < 0) {
        errors.push({ path: `elements.byId.${id}.start`, message: 'start must be >= 0 number', severity: 'error' });
    }
    if (typeof el.duration !== 'number' || el.duration <= 0) {
        errors.push({
            path: `elements.byId.${id}.duration`,
            message: 'duration must be > 0 number',
            severity: 'error',
        });
    }
    if (typeof el.name !== 'string' || !el.name) {
        errors.push({ path: `elements.byId.${id}.name`, message: 'name required', severity: 'error' });
    }
}

function validateTrack(tr: Track, id: string, elementIdSet: Set<string>, errors: ValidationError[]) {
    if (tr.id !== id) {
        errors.push({ path: `tracks.byId.${id}.id`, message: 'Track ID mismatch with key', severity: 'error' });
    }
    if (typeof tr.name !== 'string' || !tr.name) {
        errors.push({ path: `tracks.byId.${id}.name`, message: 'name required', severity: 'error' });
    }
    if (!Array.isArray(tr.elementIds)) {
        errors.push({ path: `tracks.byId.${id}.elementIds`, message: 'elementIds must be array', severity: 'error' });
    } else {
        for (let i = 0; i < tr.elementIds.length; i++) {
            const ref = tr.elementIds[i];
            if (typeof ref !== 'string' || !ref) {
                errors.push({
                    path: `tracks.byId.${id}.elementIds[${i}]`,
                    message: 'Invalid element reference (must be non-empty string)',
                    severity: 'error',
                });
                continue;
            }
            if (!elementIdSet.has(ref)) {
                errors.push({
                    path: `tracks.byId.${id}.elementIds[${i}]`,
                    message: `Missing referenced element '${ref}'`,
                    severity: 'error',
                });
            }
        }
    }
}
