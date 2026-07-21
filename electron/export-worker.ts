import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

interface HashRequest {
    id: string;
    type: 'sha256';
    path: string;
}

const parentPort = (process as NodeJS.Process & {
    parentPort?: { on(event: 'message', listener: (event: { data: HashRequest }) => void): void; postMessage(value: unknown): void };
}).parentPort;

parentPort?.on('message', ({ data }) => {
    if (!data || data.type !== 'sha256' || typeof data.id !== 'string' || typeof data.path !== 'string') return;
    const hash = createHash('sha256');
    let bytes = 0;
    const stream = createReadStream(data.path);
    stream.on('data', (chunk) => {
        const dataChunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        bytes += dataChunk.byteLength;
        hash.update(dataChunk);
    });
    stream.on('end', () => parentPort.postMessage({ id: data.id, ok: true, sha256: hash.digest('hex'), bytes }));
    stream.on('error', (error) => parentPort.postMessage({ id: data.id, ok: false, error: error.message }));
});
