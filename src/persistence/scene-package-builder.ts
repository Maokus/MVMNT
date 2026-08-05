import { zipSync, strToU8 } from 'fflate';
import iconDataUrl from '@assets/Icon.icns?inline';
import { serializeStable } from './stable-stringify';

export interface PackageAsset {
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
}

export interface ScenePackageInput {
    envelope: unknown;
    audioAssets: Array<[string, PackageAsset]>;
    midiAssets: Array<[string, PackageAsset]>;
    fontAssets: Array<[string, PackageAsset]>;
    waveformAssets: Array<[string, PackageAsset]>;
    audioFeatureAssets: Array<[string, PackageAsset]>;
    pluginAssets: Array<[string, PackageAsset]>;
    visualAssets: Array<[string, PackageAsset]>;
}

function base64ToUint8Array(base64: string): Uint8Array {
    if (typeof atob === 'function') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of base64.replace(/=+$/, '')) {
        const index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(char);
        if (index === -1) continue;
        buffer = (buffer << 6) | index;
        bits += 8;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 0xff);
        }
    }
    return new Uint8Array(bytes);
}

function addAssets(
    files: Record<string, Uint8Array>,
    assets: Array<[string, PackageAsset]>,
    pathFor: (id: string, payload: PackageAsset) => string
) {
    for (const [id, payload] of assets) files[pathFor(id, payload)] = payload.bytes;
}

/** Pure, synchronous package builder. It is executed in a worker in production. */
export function buildScenePackage(input: ScenePackageInput): Uint8Array<ArrayBuffer> {
    const files: Record<string, Uint8Array> = { document.json: strToU8(serializeStable(input.envelope)) };
    try {
        const base64 = iconDataUrl.startsWith('data:') ? iconDataUrl.slice(iconDataUrl.indexOf(',') + 1) : iconDataUrl;
        files['Icon.icns'] = base64ToUint8Array(base64);
    } catch {
        files['Icon.icns'] = strToU8('icns', true);
    }
    addAssets(files, input.audioAssets, (id, payload) => `assets/audio/${id}/${payload.filename || `${id}.bin`}`);
    addAssets(files, input.midiAssets, (id, payload) => `assets/midi/${id}/${payload.filename || 'source.mid'}`);
    addAssets(files, input.fontAssets, (id, payload) => `assets/fonts/${id}/${payload.filename || `${id}.bin`}`);
    addAssets(files, input.waveformAssets, (key, payload) => {
        const [id, ...rest] = key.split('/');
        return `assets/waveforms/${id}/${rest.join('/') || payload.filename || 'waveform.json'}`;
    });
    addAssets(files, input.audioFeatureAssets, (key, payload) => {
        const [id, ...rest] = key.split('/');
        return `assets/audio-features/${id}/${rest.join('/') || payload.filename || 'feature_caches.json'}`;
    });
    addAssets(files, input.pluginAssets, (id, payload) => `plugins/${payload.filename || `${id}.mvmnt-plugin`}`);
    addAssets(files, input.visualAssets, (id, payload) => `assets/visual/${id}/${payload.filename || `${id}.bin`}`);
    return zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
