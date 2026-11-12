/// <reference lib="webworker" />
import { parseScenePackage } from './scene-package';

self.onmessage = ({ data }: MessageEvent<Uint8Array>) => {
    try {
        const contents = parseScenePackage(data);
        const buffers = new Set<ArrayBuffer>();
        for (const value of Object.values(contents)) {
            if (!(value instanceof Map)) continue;
            for (const payload of value.values()) {
                if (payload instanceof Map) {
                    for (const bytes of payload.values()) buffers.add(bytes.buffer as ArrayBuffer);
                } else buffers.add(payload.buffer as ArrayBuffer);
            }
        }
        self.postMessage({ contents }, [...buffers]);
    } catch (error) {
        const failure = error as Error & { code?: string };
        self.postMessage({ error: { code: failure.code, message: failure.message } });
    }
};
