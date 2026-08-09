import { StreamTarget, type StreamTargetChunk } from 'mediabunny';
import type { DesktopExportBeginRequest } from '../../../electron/shared/desktop-api';
import type { ExportOutputSession } from '../contracts';

export async function beginDesktopOutput(request: DesktopExportBeginRequest): Promise<ExportOutputSession | null> {
    const desktop = window.mvmntDesktop;
    if (!desktop) throw new Error('MVMNT desktop export services are unavailable.');
    const begin = await desktop.exports.begin(request);
    if (begin.status === 'canceled') return null;
    if (begin.status !== 'ready' || !begin.sessionId)
        throw new Error(begin.error ?? 'Could not create export destination.');

    const sessionId = begin.sessionId;
    let terminal = false;
    const writable = new WritableStream<StreamTargetChunk>(
        {
            async write(chunk) {
                if (terminal) throw new Error('Export output is already closed.');
                await desktop.exports.write({ sessionId, bytes: chunk.data, position: chunk.position });
            },
        },
        new CountQueuingStrategy({ highWaterMark: 2 })
    );

    return {
        sessionId,
        displayName: begin.displayName ?? request.suggestedName,
        videoTarget: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
        async writeFrame(filename, blob) {
            await desktop.exports.writeFrame({ sessionId, filename, bytes: await blobToBytes(blob) });
        },
        async writeArtifact(filename, blob) {
            await desktop.exports.writeArtifact({ sessionId, filename, bytes: await blobToBytes(blob) });
        },
        async complete(manifest, expectedFrames) {
            if (terminal) throw new Error('Export output is already closed.');
            const result = await desktop.exports.complete({ sessionId, manifest, expectedFrames });
            if (result.status !== 'completed') throw new Error(result.error ?? 'Export finalization failed.');
            terminal = true;
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
    const buffer =
        typeof blob.arrayBuffer === 'function'
            ? await blob.arrayBuffer()
            : await new Promise<ArrayBuffer>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onerror = () => reject(reader.error ?? new Error('Could not read export artifact.'));
                  reader.onload = () => resolve(reader.result as ArrayBuffer);
                  reader.readAsArrayBuffer(blob);
              });
    return new Uint8Array(buffer);
}
