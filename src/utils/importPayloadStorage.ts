import { IMPORT_SCENE_PAYLOAD_FORMAT_KEY, IMPORT_SCENE_PAYLOAD_KEY } from '../constants/storageKeys';
import { base64ToUint8Array, uint8ArrayToBase64 } from './base64';

export type StoredPayloadFormat = 'base64' | 'text';
export type SceneImportPayload = string | Uint8Array | ArrayBuffer;

export const ZIP_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

export function isZipBytes(bytes: Uint8Array): boolean {
    if (bytes.length < ZIP_SIGNATURE.length) return false;
    for (let i = 0; i < ZIP_SIGNATURE.length; i++) {
        if (bytes[i] !== ZIP_SIGNATURE[i]) return false;
    }
    return true;
}

function toUint8Array(input: Uint8Array | ArrayBuffer): Uint8Array {
    return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function writeStoredImportPayload(payload: SceneImportPayload, storage: Storage = sessionStorage): void {
    if (typeof payload === 'string') {
        storage.setItem(IMPORT_SCENE_PAYLOAD_KEY, payload);
        storage.setItem(IMPORT_SCENE_PAYLOAD_FORMAT_KEY, 'text');
        return;
    }
    const bytes = toUint8Array(payload);
    storage.setItem(IMPORT_SCENE_PAYLOAD_KEY, uint8ArrayToBase64(bytes));
    storage.setItem(IMPORT_SCENE_PAYLOAD_FORMAT_KEY, 'base64');
}

export function readStoredImportPayload(storage: Storage = sessionStorage): string | Uint8Array | null {
    try {
        const raw = storage.getItem(IMPORT_SCENE_PAYLOAD_KEY);
        if (!raw) return null;
        const format = storage.getItem(IMPORT_SCENE_PAYLOAD_FORMAT_KEY) as StoredPayloadFormat | null;
        if (format === 'base64') {
            return base64ToUint8Array(raw);
        }
        return raw;
    } catch (error) {
        console.warn('Failed to read stored import payload', error);
        return null;
    }
}

export function clearStoredImportPayload(storage: Storage = sessionStorage): void {
    storage.removeItem(IMPORT_SCENE_PAYLOAD_KEY);
    storage.removeItem(IMPORT_SCENE_PAYLOAD_FORMAT_KEY);
}
