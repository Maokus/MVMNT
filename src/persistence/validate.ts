/**
 * Validation – Expanded structural checks & error codes.
 *
 * Adds:
 *  - Error code taxonomy (fatal subset)
 *  - Type assertions for timeline numeric fields (if present)
 *  - Track objects basic shape validation (id/name/type)
 *  - Range checks for rowHeight (if present) & globalBpm > 0
 */

export const CURRENT_SCHEMA_VERSION = 10;

/**
 * Maps schema version to the minimum app version required to open files at that version.
 * Used for user-facing error messages ("requires MVMNT 0.15+").
 */
export const SCHEMA_TO_MIN_APP_VERSION: Record<number, string> = {
    1: '0.1.0',
    2: '0.8.0',
    3: '0.12.0',
    4: '0.14.0',
    5: '0.14.0',
    6: '0.15.0',
    7: '0.15.4',
    8: '0.15.4',
    9: '0.15.5',
    10: '0.16.0',
};

export type ValidationErrorCode =
    | 'ERR_ROOT_TYPE'
    | 'ERR_SCHEMA_VERSION'
    | 'ERR_FORMAT'
    | 'ERR_METADATA_MISSING'
    | 'ERR_METADATA_ID'
    | 'ERR_METADATA_NAME'
    | 'ERR_METADATA_AUTHOR'
    | 'ERR_PLUGINS_SHAPE'
    | 'ERR_SCENE_MISSING'
    | 'ERR_SCENE_ELEMENTS_TYPE'
    | 'ERR_SCENE_ELEMENTS_ORDER_TYPE'
    | 'ERR_DUP_ELEMENT_ID'
    | 'ERR_TIMELINE_MISSING'
    | 'ERR_TIMELINE_CORE_MISSING'
    | 'ERR_TRACKS_MISSING'
    | 'ERR_TRACKS_ORDER_TYPE'
    | 'ERR_TRACKS_ORDER_ITEM_TYPE'
    | 'ERR_TRACKS_ORDER_REF'
    | 'ERR_TRACK_SHAPE'
    | 'ERR_MIDI_CLIPS_SHAPE'
    | 'ERR_MIDI_CLIP_SOURCE'
    | 'ERR_MIDI_CLIP_DUPLICATE'
    | 'ERR_MIDI_CLIP_OVERLAP'
    | 'ERR_AUDIO_TRACK_SHAPE'
    | 'ERR_AUDIO_CLIP_SHAPE'
    | 'ERR_AUDIO_LEGACY_FIELD'
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
    const supportedVersions = Object.keys(SCHEMA_TO_MIN_APP_VERSION).map(Number);
    if (!supportedVersions.includes(schemaVersion)) {
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
    } else if (schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8 || schemaVersion === 9 || schemaVersion === 10) {
        // V6+: elements is a Record keyed by ID, elementsOrder is the ordering array
        if (typeof root.scene.elements !== 'object' || root.scene.elements === null || Array.isArray(root.scene.elements)) {
            errors.push(err('ERR_SCENE_ELEMENTS_TYPE', 'scene.elements must be an object in schema v6', 'scene.elements'));
        }
        if (!Array.isArray(root.scene.elementsOrder)) {
            errors.push(err('ERR_SCENE_ELEMENTS_ORDER_TYPE', 'scene.elementsOrder must be array in schema v6', 'scene.elementsOrder'));
        } else {
            const seen = new Set<string>();
            for (let i = 0; i < root.scene.elementsOrder.length; i++) {
                const id = root.scene.elementsOrder[i];
                if (typeof id === 'string') {
                    if (seen.has(id)) {
                        errors.push(err('ERR_DUP_ELEMENT_ID', 'Duplicate element id ' + id, 'scene.elementsOrder[' + i + ']'));
                        break;
                    }
                    seen.add(id);
                }
            }
        }
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
    if (root.plugins !== undefined) {
        if (!Array.isArray(root.plugins)) {
            errors.push(err('ERR_PLUGINS_SHAPE', 'plugins must be array when present', 'plugins'));
        } else {
            for (let i = 0; i < root.plugins.length; i++) {
                const entry = root.plugins[i];
                if (!entry || typeof entry !== 'object') {
                    errors.push(err('ERR_PLUGINS_SHAPE', 'Invalid plugin dependency entry', `plugins[${i}]`));
                    break;
                }
                if (typeof entry.pluginId !== 'string' || typeof entry.version !== 'string') {
                    errors.push(
                        err('ERR_PLUGINS_SHAPE', 'Plugin dependency requires pluginId and version', `plugins[${i}]`)
                    );
                    break;
                }
                if (entry.elementTypesUsed && !Array.isArray(entry.elementTypesUsed)) {
                    errors.push(
                        err('ERR_PLUGINS_SHAPE', 'elementTypesUsed must be array', `plugins[${i}].elementTypesUsed`)
                    );
                    break;
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
                if (schemaVersion >= 8 && tr.type === 'midi') {
                    validateMidiTrackClips(tr, tl.midiCache, `timeline.tracks.${k}`, errors);
                    if (errors.length) break;
                }
                if (schemaVersion >= 10 && tr.type === 'audio') {
                    validateAudioTrackClips(tr, `timeline.tracks.${k}`, errors);
                    if (errors.length) break;
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

    if (schemaVersion === 2 || schemaVersion === 4 || schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8 || schemaVersion === 9 || schemaVersion === 10) {
        if (!root.assets || typeof root.assets !== 'object') {
            errors.push(err('ERR_ASSETS_MISSING', 'Missing assets block', 'assets'));
        } else {
            const storage = root.assets.storage;
            if (
                (schemaVersion >= 10 && storage !== 'zip-package') ||
                (schemaVersion < 10 && storage !== 'inline-json' && storage !== 'zip-package')
            ) {
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

function validateAudioTrackClips(track: any, path: string, errors: ValidationError[]): void {
    for (const field of ['offsetTicks', 'regionStartTick', 'regionEndTick', 'audioSourceId']) {
        if (Object.prototype.hasOwnProperty.call(track, field)) {
            errors.push(err('ERR_AUDIO_LEGACY_FIELD', `Audio track contains removed field ${field}`, `${path}.${field}`));
            return;
        }
    }
    if (!Array.isArray(track.clips)) {
        errors.push(err('ERR_AUDIO_TRACK_SHAPE', 'Audio track clips must be an array', `${path}.clips`));
        return;
    }
    const ids = new Set<string>();
    for (let index = 0; index < track.clips.length; index += 1) {
        const clip = track.clips[index];
        const clipPath = `${path}.clips[${index}]`;
        if (!clip || typeof clip !== 'object' || clip.type !== 'audio') {
            errors.push(err('ERR_AUDIO_CLIP_SHAPE', 'Invalid audio clip shape', clipPath));
            return;
        }
        if (
            typeof clip.id !== 'string' ||
            typeof clip.sourceId !== 'string' ||
            typeof clip.offsetTicks !== 'number' ||
            !Number.isFinite(clip.offsetTicks)
        ) {
            errors.push(err('ERR_AUDIO_CLIP_SHAPE', 'Audio clip requires string id/sourceId and finite offsetTicks', clipPath));
            return;
        }
        if (ids.has(clip.id)) {
            errors.push(err('ERR_AUDIO_CLIP_SHAPE', `Duplicate audio clip id ${clip.id}`, `${clipPath}.id`));
            return;
        }
        ids.add(clip.id);
        for (const field of ['regionStartTick', 'regionEndTick']) {
            if (Object.prototype.hasOwnProperty.call(clip, field)) {
                errors.push(err('ERR_AUDIO_LEGACY_FIELD', `Audio clip contains removed field ${field}`, `${clipPath}.${field}`));
                return;
            }
        }
        const start = clip.sourceStartSeconds;
        const end = clip.sourceEndSeconds;
        if (start !== undefined && (typeof start !== 'number' || !Number.isFinite(start) || start < 0)) {
            errors.push(err('ERR_AUDIO_CLIP_SHAPE', 'sourceStartSeconds must be a finite non-negative number', `${clipPath}.sourceStartSeconds`));
            return;
        }
        if (end !== undefined && (typeof end !== 'number' || !Number.isFinite(end) || end < 0)) {
            errors.push(err('ERR_AUDIO_CLIP_SHAPE', 'sourceEndSeconds must be a finite non-negative number', `${clipPath}.sourceEndSeconds`));
            return;
        }
        if (typeof start === 'number' && typeof end === 'number' && end <= start) {
            errors.push(err('ERR_AUDIO_CLIP_SHAPE', 'sourceEndSeconds must be greater than sourceStartSeconds', clipPath));
            return;
        }
    }
}

function getClipTimelineBounds(midiCache: any, clip: any): { startTick: number; endTick: number } | null {
    const source = midiCache?.[clip.sourceId];
    if (!source) return null;
    const sourceStart =
        typeof source.bounds?.minTick === 'number'
            ? source.bounds.minTick
            : Array.isArray(source.notesRaw) && source.notesRaw.length
              ? Math.min(...source.notesRaw.map((note: any) => note.startTick).filter((tick: any) => typeof tick === 'number'))
              : 0;
    const sourceEnd =
        typeof source.bounds?.maxTick === 'number'
            ? source.bounds.maxTick
            : Array.isArray(source.notesRaw) && source.notesRaw.length
              ? Math.max(...source.notesRaw.map((note: any) => note.endTick).filter((tick: any) => typeof tick === 'number'))
              : undefined;
    const startTick = typeof clip.regionStartTick === 'number' ? clip.regionStartTick : sourceStart;
    const endTick = typeof clip.regionEndTick === 'number' ? clip.regionEndTick : sourceEnd;
    if (typeof endTick !== 'number' || !Number.isFinite(startTick) || !Number.isFinite(endTick) || endTick <= startTick) {
        return null;
    }
    return { startTick: clip.offsetTicks + startTick, endTick: clip.offsetTicks + endTick };
}

function validateMidiTrackClips(
    track: any,
    midiCache: any,
    path: string,
    errors: ValidationError[]
): void {
    if (!Array.isArray(track.clips)) {
        errors.push(err('ERR_MIDI_CLIPS_SHAPE', 'MIDI track clips must be an array', `${path}.clips`));
        return;
    }
    const seenIds = new Set<string>();
    const bounds: Array<{ id: string; startTick: number; endTick: number }> = [];
    for (let i = 0; i < track.clips.length; i++) {
        const clip = track.clips[i];
        const clipPath = `${path}.clips[${i}]`;
        if (!clip || typeof clip !== 'object' || clip.type !== 'midi') {
            errors.push(err('ERR_MIDI_CLIPS_SHAPE', 'Invalid MIDI clip shape', clipPath));
            return;
        }
        if (typeof clip.id !== 'string' || typeof clip.sourceId !== 'string' || typeof clip.offsetTicks !== 'number' || !Number.isFinite(clip.offsetTicks)) {
            errors.push(err('ERR_MIDI_CLIPS_SHAPE', 'MIDI clip requires string id/sourceId and finite offsetTicks', clipPath));
            return;
        }
        if (seenIds.has(clip.id)) {
            errors.push(err('ERR_MIDI_CLIP_DUPLICATE', `Duplicate MIDI clip id ${clip.id}`, `${clipPath}.id`));
            return;
        }
        seenIds.add(clip.id);
        if (
            (clip.regionStartTick !== undefined && (typeof clip.regionStartTick !== 'number' || !Number.isFinite(clip.regionStartTick))) ||
            (clip.regionEndTick !== undefined && (typeof clip.regionEndTick !== 'number' || !Number.isFinite(clip.regionEndTick))) ||
            (typeof clip.regionStartTick === 'number' && typeof clip.regionEndTick === 'number' && clip.regionEndTick <= clip.regionStartTick)
        ) {
            errors.push(err('ERR_MIDI_CLIPS_SHAPE', 'Invalid MIDI clip region ticks', clipPath));
            return;
        }
        if (!midiCache || !midiCache[clip.sourceId]) {
            errors.push(err('ERR_MIDI_CLIP_SOURCE', `MIDI clip source ${clip.sourceId} is missing`, `${clipPath}.sourceId`));
            return;
        }
        const clipBounds = getClipTimelineBounds(midiCache, clip);
        if (clipBounds) bounds.push({ id: clip.id, ...clipBounds });
    }
    bounds.sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick);
    for (let i = 1; i < bounds.length; i++) {
        if (bounds[i].startTick < bounds[i - 1].endTick) {
            errors.push(
                err(
                    'ERR_MIDI_CLIP_OVERLAP',
                    `MIDI clip ${bounds[i].id} overlaps ${bounds[i - 1].id}`,
                    `${path}.clips`
                )
            );
            return;
        }
    }
}
