import { StreamTarget, type StreamTargetChunk } from 'mediabunny';
import type {
    DesktopExportBeginRequest,
    DesktopExportBeginResult,
    DesktopExportCompleteResult,
} from '../../electron/shared/desktop-api';

export interface DesktopExportSink {
    sessionId: string;
    displayName: string;
    target: StreamTarget;
    complete(manifest?: Record<string, unknown>): Promise<DesktopExportCompleteResult>;
    abort(): Promise<void>;
}

export async function beginDesktopExport(
    request: DesktopExportBeginRequest,
): Promise<DesktopExportBeginResult> {
    const desktop = window.mvmntDesktop;
    if (!desktop) return { status: 'error', error: 'Desktop export services are unavailable.' };
    return desktop.exports.begin(request);
}

export function createDesktopStreamSink(sessionId: string, displayName: string): DesktopExportSink {
    const desktop = window.mvmntDesktop;
    if (!desktop) throw new Error('Desktop export services are unavailable.');
    let terminal = false;
    const writable = new WritableStream<StreamTargetChunk>({
        async write(chunk) {
            if (terminal) throw new Error('Export sink is already closed.');
            await desktop.exports.write({ sessionId, bytes: chunk.data, position: chunk.position });
        },
    }, new CountQueuingStrategy({ highWaterMark: 2 }));
    return {
        sessionId,
        displayName,
        target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
        async complete(manifest) {
            if (terminal) throw new Error('Export sink is already closed.');
            const result = await desktop.exports.complete({ sessionId, manifest });
            if (result.status === 'completed') terminal = true;
            return result;
        },
        async abort() {
            if (terminal) return;
            terminal = true;
            await desktop.exports.abort(sessionId);
        },
    };
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
    const buffer = typeof blob.arrayBuffer === 'function'
        ? await blob.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read PNG frame.'));
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.readAsArrayBuffer(blob);
        });
    return new Uint8Array(buffer);
}

export async function writeDesktopFrame(sessionId: string, filename: string, blob: Blob): Promise<void> {
    const desktop = window.mvmntDesktop;
    if (!desktop) throw new Error('Desktop export services are unavailable.');
    await desktop.exports.writeFrame({
        sessionId,
        filename,
        bytes: await blobToBytes(blob),
    });
}
