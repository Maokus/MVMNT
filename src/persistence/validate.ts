/**
 * Validation – Expanded structural checks & error codes.
 *
 * Adds:
 *  - Error code taxonomy (fatal subset)
 *  - Type assertions for timeline numeric fields (if present)
 *  - Track objects basic shape validation (id/name/type)
 *  - Range checks for rowHeight (if present) & globalBpm > 0
 */

export type ValidationErrorCode =
    | 'ERR_ROOT_TYPE'
    | 'ERR_SCHEMA_VERSION'
    | 'ERR_FORMAT'
    | 'ERR_METADATA_MISSING'
    | 'ERR_METADATA_ID'
    | 'ERR_METADATA_NAME'
    | 'ERR_METADATA_AUTHOR'
    | 'ERR_SCENE_MISSING'
    | 'ERR_SCENE_ELEMENTS_TYPE'
    | 'ERR_DUP_ELEMENT_ID'
    | 'ERR_TIMELINE_MISSING'
    | 'ERR_TIMELINE_CORE_MISSING'
    | 'ERR_TRACKS_MISSING'
    | 'ERR_TRACKS_ORDER_TYPE'
    | 'ERR_TRACKS_ORDER_ITEM_TYPE'
    | 'ERR_TRACKS_ORDER_REF'
    | 'ERR_TRACK_SHAPE'
    | 'ERR_TIMELINE_NUMERIC'
    | 'ERR_ROW_HEIGHT_RANGE'
    | 'ERR_GLOBAL_BPM_RANGE'
    | 'ERR_ASSETS_MISSING'
    | 'ERR_AUDIO_ASSET_SHAPE';

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
    path?: string;
}
export interface ValidationWarning {
    code: string; // reserved for advisory tier expansion
    message: string;
    path?: string;
}
export interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

function err(code: ValidationErrorCode, message: string, path?: string): ValidationError {
    return { code, message, path };
}

export function validateSceneEnvelope(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof data !== 'object' || data === null) {
        return { ok: false, errors: [err('ERR_ROOT_TYPE', 'Root must be an object')], warnings };
    }
    const root: any = data;
    const schemaVersion = root.schemaVersion;
    if (schemaVersion !== 1 && schemaVersion !== 2) {
        errors.push(err('ERR_SCHEMA_VERSION', 'Unsupported schemaVersion', 'schemaVersion'));
    }
    if (root.format !== 'mvmnt.scene') {
        errors.push(err('ERR_FORMAT', 'Invalid format', 'format'));
    }
    if (!root.metadata || typeof root.metadata !== 'object') {
        errors.push(err('ERR_METADATA_MISSING', 'Missing metadata object', 'metadata'));
    } else {
        if (typeof root.metadata.id !== 'string')
            errors.push(err('ERR_METADATA_ID', 'metadata.id missing or not string', 'metadata.id'));
        if (typeof root.metadata.name !== 'string')
            errors.push(err('ERR_METADATA_NAME', 'metadata.name missing or not string', 'metadata.name'));
        if (root.metadata.author !== undefined && typeof root.metadata.author !== 'string')
            errors.push(err('ERR_METADATA_AUTHOR', 'metadata.author must be string when present', 'metadata.author'));
    }
    if (!root.scene || typeof root.scene !== 'object') {
        errors.push(err('ERR_SCENE_MISSING', 'Missing scene object', 'scene'));
    } else {
        if (!Array.isArray(root.scene.elements)) {
            errors.push(err('ERR_SCENE_ELEMENTS_TYPE', 'scene.elements must be array', 'scene.elements'));
        } else {
            const seen = new Set<string>();
            for (let i = 0; i < root.scene.elements.length; i++) {
                const el = root.scene.elements[i];
                if (el && typeof el === 'object') {
                    if (typeof el.id === 'string') {
                        if (seen.has(el.id)) {
                            errors.push(
                                err(
                                    'ERR_DUP_ELEMENT_ID',
                                    'Duplicate element id ' + el.id,
                                    'scene.elements[' + i + '].id'
                                )
                            );
                            break;
                        }
                        seen.add(el.id);
                    }
                }
            }
        }
    }
    if (!root.timeline || typeof root.timeline !== 'object') {
        errors.push(err('ERR_TIMELINE_MISSING', 'Missing timeline object', 'timeline'));
    } else {
        const tl = root.timeline;
        if (!tl.timeline || typeof tl.timeline !== 'object')
            errors.push(err('ERR_TIMELINE_CORE_MISSING', 'timeline.timeline missing', 'timeline.timeline'));
        if (typeof tl.tracks !== 'object' || tl.tracks === null)
            errors.push(err('ERR_TRACKS_MISSING', 'timeline.tracks missing', 'timeline.tracks'));
        if (!Array.isArray(tl.tracksOrder))
            errors.push(err('ERR_TRACKS_ORDER_TYPE', 'timeline.tracksOrder must be array', 'timeline.tracksOrder'));
        else {
            for (let i = 0; i < tl.tracksOrder.length; i++) {
                const id = tl.tracksOrder[i];
                if (typeof id !== 'string') {
                    errors.push(
                        err(
                            'ERR_TRACKS_ORDER_ITEM_TYPE',
                            'tracksOrder item not string',
                            'timeline.tracksOrder[' + i + ']'
                        )
                    );
                    break;
                }
                if (!tl.tracks || !tl.tracks[id]) {
                    errors.push(
                        err(
                            'ERR_TRACKS_ORDER_REF',
                            'tracksOrder references missing track ' + id,
                            'timeline.tracksOrder[' + i + ']'
                        )
                    );
                    break;
                }
            }
        }
        // Track object shape (sample subset)
        if (tl.tracks && typeof tl.tracks === 'object') {
            for (const k of Object.keys(tl.tracks)) {
                const tr = tl.tracks[k];
                if (!tr || typeof tr !== 'object' || typeof tr.id !== 'string' || typeof tr.name !== 'string') {
                    errors.push(err('ERR_TRACK_SHAPE', 'Invalid track shape for id ' + k, 'timeline.tracks.' + k));
                    break;
                }
            }
        }
        // Numeric range checks (non-fatal design but still enforced here)
        if (tl.timeline && typeof tl.timeline === 'object') {
            if (typeof tl.timeline.globalBpm === 'number' && !(tl.timeline.globalBpm > 0)) {
                errors.push(err('ERR_GLOBAL_BPM_RANGE', 'globalBpm must be > 0', 'timeline.timeline.globalBpm'));
            }
            if (typeof tl.rowHeight === 'number') {
                if (tl.rowHeight < 8 || tl.rowHeight > 400) {
                    errors.push(err('ERR_ROW_HEIGHT_RANGE', 'rowHeight out of expected range', 'timeline.rowHeight'));
                }
            }
        }
    }

    if (schemaVersion === 2) {
        if (!root.assets || typeof root.assets !== 'object') {
            errors.push(err('ERR_ASSETS_MISSING', 'Missing assets block', 'assets'));
        } else {
            const storage = root.assets.storage;
            if (storage !== 'inline-json' && storage !== 'zip-package') {
                errors.push(err('ERR_ASSETS_MISSING', 'Invalid assets.storage value', 'assets.storage'));
            }
            const audio = root.assets.audio;
            if (!audio || typeof audio !== 'object' || typeof audio.byId !== 'object') {
                errors.push(err('ERR_AUDIO_ASSET_SHAPE', 'assets.audio.byId must be object', 'assets.audio.byId'));
            } else {
                for (const [id, record] of Object.entries(audio.byId)) {
                    if (!record || typeof record !== 'object') {
                        errors.push(err('ERR_AUDIO_ASSET_SHAPE', 'Invalid audio asset record', `assets.audio.byId.${id}`));
                        break;
                    }
                    if (typeof (record as any).hash !== 'string' || typeof (record as any).mimeType !== 'string') {
                        errors.push(err('ERR_AUDIO_ASSET_SHAPE', 'Audio asset missing hash or mimeType', `assets.audio.byId.${id}`));
                        break;
                    }
                }
            }
        }
    }

    return { ok: errors.length === 0, errors, warnings };
}
