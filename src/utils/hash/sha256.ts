export type HashSource =
    | ArrayBuffer
    | ArrayBufferView
    | Uint8Array
    | Blob
    | AsyncIterable<Uint8Array>
    | Iterable<Uint8Array>;

function isBlob(value: unknown): value is Blob {
    return typeof Blob !== 'undefined' && value instanceof Blob;
}

function normalizeChunk(chunk: unknown): Uint8Array | null {
    if (chunk instanceof Uint8Array) return chunk;
    if (ArrayBuffer.isView(chunk)) {
        const view = chunk as ArrayBufferView;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
    if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
    return null;
}

async function* toAsyncIterable(source: HashSource): AsyncIterable<Uint8Array> {
    if (source instanceof Uint8Array) {
        yield source;
        return;
    }
    if (ArrayBuffer.isView(source)) {
        const view = source as ArrayBufferView;
        yield new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        return;
    }
    if (source instanceof ArrayBuffer) {
        yield new Uint8Array(source);
        return;
    }
    if (isBlob(source)) {
        if (typeof source.stream === 'function') {
            const stream = source.stream();
            const reader = stream.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) {
                        const chunk = normalizeChunk(value);
                        if (chunk) yield chunk;
                    }
                }
            } finally {
                reader.releaseLock();
            }
            return;
        }
        const buf = await source.arrayBuffer();
        yield new Uint8Array(buf);
        return;
    }
    if (typeof (source as any)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of source as AsyncIterable<unknown>) {
            const normalized = normalizeChunk(chunk);
            if (normalized) yield normalized;
        }
        return;
    }
    if (typeof (source as any)[Symbol.iterator] === 'function') {
        for (const chunk of source as Iterable<unknown>) {
            const normalized = normalizeChunk(chunk);
            if (normalized) yield normalized;
        }
        return;
    }
    throw new TypeError('Unsupported hash source type');
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function nodeHash(chunks: AsyncIterable<Uint8Array>): Promise<string | null> {
    try {
        const { createHash } = await import('crypto');
        const hash = createHash('sha256');
        for await (const chunk of chunks) {
            hash.update(chunk);
        }
        return hash.digest('hex');
    } catch {
        return null;
    }
}

async function subtleHash(chunks: AsyncIterable<Uint8Array>): Promise<string> {
    const buffers: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of chunks) {
        const copy = new Uint8Array(chunk);
        buffers.push(copy);
        total += copy.byteLength;
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const buf of buffers) {
        merged.set(buf, offset);
        offset += buf.byteLength;
    }
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', merged.buffer);
        return toHex(new Uint8Array(digest));
    }
    const nodeResult = await nodeHash((async function* () {
        yield merged;
    })());
    if (nodeResult) return nodeResult;
    throw new Error('No crypto implementation available for SHA-256');
}

export async function sha256Hex(source: HashSource): Promise<string> {
    const iter = toAsyncIterable(source);
    const nodeResult = await nodeHash(iter);
    if (nodeResult) return nodeResult;
    // Node path consumed iterator; rebuild for subtle hash
    return subtleHash(toAsyncIterable(source));
}
