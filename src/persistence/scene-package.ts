import { unzipSync } from 'fflate';
import type { SceneExportEnvelopeV2 } from './export';
import { isZipBytes } from '@utils/importPayloadStorage';

export type SceneEnvelope = SceneExportEnvelopeV2 | Record<string, any>;

export interface ScenePackageContents {
    envelope: SceneEnvelope;
    audioPayloads: Map<string, Uint8Array>;
    midiPayloads: Map<string, Uint8Array>;
    warnings: { message: string }[];
}

export type ScenePackageErrorCode = 'ERR_PACKAGE_FORMAT' | 'ERR_ZIP_DOCUMENT' | 'ERR_JSON_PARSE';

export class ScenePackageError extends Error {
    public readonly code: ScenePackageErrorCode;

    constructor(code: ScenePackageErrorCode, message: string) {
        super(message);
        this.name = 'ScenePackageError';
        this.code = code;
    }
}

export function decodeSceneText(data: Uint8Array): string {
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(data);
    }
    let result = '';
    for (let i = 0; i < data.length; i++) {
        result += String.fromCharCode(data[i]);
    }
    return result;
}

function collectScenePayloads(archive: Record<string, Uint8Array>): {
    audio: Map<string, Uint8Array>;
    midi: Map<string, Uint8Array>;
} {
    const audioPayloads = new Map<string, Uint8Array>();
    const midiPayloads = new Map<string, Uint8Array>();

    for (const path of Object.keys(archive)) {
        if (path.startsWith('assets/audio/')) {
            const parts = path.split('/');
            if (parts.length >= 3) {
                const assetId = parts[2];
                if (!audioPayloads.has(assetId)) {
                    audioPayloads.set(assetId, archive[path]);
                }
            }
        } else if (path.startsWith('assets/midi/')) {
            const parts = path.split('/');
            if (parts.length >= 3) {
                const assetId = parts[2];
                if (!midiPayloads.has(assetId)) {
                    midiPayloads.set(assetId, archive[path]);
                }
            }
        }
    }

    return { audio: audioPayloads, midi: midiPayloads };
}

export function parseScenePackage(bytes: Uint8Array): ScenePackageContents {
    if (!isZipBytes(bytes)) {
        throw new ScenePackageError('ERR_PACKAGE_FORMAT', 'Scene package must be a ZIP archive');
    }

    const archive = unzipSync(bytes);
    const documentBytes = archive['document.json'];
    if (!documentBytes) {
        throw new ScenePackageError('ERR_ZIP_DOCUMENT', 'Scene package missing document.json');
    }

    let envelope: SceneEnvelope;
    try {
        envelope = JSON.parse(decodeSceneText(documentBytes));
    } catch (error: any) {
        throw new ScenePackageError('ERR_JSON_PARSE', 'Invalid document.json: ' + error.message);
    }

    const payloads = collectScenePayloads(archive);
    return {
        envelope,
        audioPayloads: payloads.audio,
        midiPayloads: payloads.midi,
        warnings: [],
    };
}

/**
 * @deprecated Legacy inline JSON scene payloads are deprecated. Use packaged .mvt exports instead.
 */
export function parseLegacyInlineScene(jsonText: string): ScenePackageContents {
    const envelope = JSON.parse(jsonText) as SceneEnvelope;
    return {
        envelope,
        audioPayloads: new Map(),
        midiPayloads: new Map(),
        warnings: [
            {
                message: 'Legacy inline JSON scene payloads are deprecated. Please re-export as a packaged .mvt scene.',
            },
        ],
    };
}

export function extractSceneMetadataFromArtifact(data: Uint8Array | string):
    | { name?: string; author?: string; description?: string }
    | undefined {
    try {
        if (typeof data === 'string') {
            const legacy = parseLegacyInlineScene(data);
            const metadata = legacy.envelope?.metadata;
            if (metadata && typeof metadata === 'object') {
                return {
                    name: typeof metadata.name === 'string' ? metadata.name : undefined,
                    author: typeof metadata.author === 'string' ? metadata.author : undefined,
                    description: typeof metadata.description === 'string' ? metadata.description : undefined,
                };
            }
            return undefined;
        }

        const { envelope } = parseScenePackage(data);
        const metadata = envelope?.metadata;
        if (!metadata || typeof metadata !== 'object') {
            return undefined;
        }
        return {
            name: typeof metadata.name === 'string' ? metadata.name : undefined,
            author: typeof metadata.author === 'string' ? metadata.author : undefined,
            description: typeof metadata.description === 'string' ? metadata.description : undefined,
        };
    } catch (error) {
        console.warn('[scene-package] Failed to extract metadata from artifact', error);
        return undefined;
    }
}
