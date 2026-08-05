/// <reference lib="webworker" />

import { buildScenePackage, type ScenePackageInput } from './scene-package-builder';

interface PackageRequest {
    id: number;
    input: ScenePackageInput;
}

self.onmessage = async ({ data }: MessageEvent<PackageRequest>) => {
    try {
        const zip = buildScenePackage(data.input);
        const digest = await crypto.subtle.digest('SHA-256', zip);
        self.postMessage({ id: data.id, zip, digest }, [zip.buffer, digest]);
    } catch (error) {
        self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
    }
};
