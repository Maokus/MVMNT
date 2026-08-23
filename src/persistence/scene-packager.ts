import { sha256Hex } from '@utils/hash/sha256';
import { buildScenePackage, type ScenePackageInput } from './scene-package-builder';

interface WorkerResponse {
    id: number;
    zip?: Uint8Array<ArrayBuffer>;
    digest?: ArrayBuffer;
    error?: string;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (value: PackagedScene) => void; reject: (error: Error) => void }>();

export interface PackagedScene {
    zip: Uint8Array<ArrayBuffer>;
    digest: string;
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getWorker(): Worker | null {
    if (worker || typeof Worker === 'undefined') return worker;
    worker = new Worker(new URL('./scene-package.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        const request = pending.get(data.id);
        if (!request) return;
        pending.delete(data.id);
        if (data.error || !data.zip || !data.digest) {
            request.reject(new Error(data.error || 'Scene packaging worker returned an invalid response'));
            return;
        }
        request.resolve({ zip: data.zip, digest: hex(new Uint8Array(data.digest)) });
    };
    worker.onerror = (event) => {
        const error = new Error(event.message || 'Scene packaging worker failed');
        for (const request of pending.values()) request.reject(error);
        pending.clear();
        worker?.terminate();
        worker = null;
    };
    return worker;
}

function transferablePackageBuffers(input: ScenePackageInput): Transferable[] {
    const buffers = new Set<ArrayBuffer>();
    const add = (bytes: Uint8Array | undefined) => {
        if (bytes?.buffer instanceof ArrayBuffer) buffers.add(bytes.buffer);
    };
    add(input.iconBytes);
    for (const assets of [
        input.audioAssets,
        input.midiAssets,
        input.fontAssets,
        input.waveformAssets,
        input.audioFeatureAssets,
        input.pluginAssets,
        input.visualAssets,
    ]) {
        for (const [, asset] of assets) add(asset.bytes);
    }
    return [...buffers];
}

/** Packages CPU-heavy JSON serialization and ZIP compression off the renderer thread. */
export async function packageScene(input: ScenePackageInput): Promise<PackagedScene> {
    const packagingWorker = getWorker();
    if (!packagingWorker) {
        const zip = buildScenePackage(input);
        return { zip, digest: await sha256Hex(zip) };
    }
    const id = nextRequestId++;
    return new Promise<PackagedScene>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        packagingWorker.postMessage({ id, input }, transferablePackageBuffers(input));
    });
}
