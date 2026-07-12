import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFileStore } from '@persistence/local-file-store';

class FakeRequest<T = unknown> {
    result!: T;
    error: Error | null = null;
    onsuccess: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    succeed(value: T) {
        this.result = value;
        queueMicrotask(() => this.onsuccess?.(new Event('success')));
    }
}

class FakeObjectStore {
    constructor(private readonly values: Map<string, unknown>) {}

    put(value: unknown, key: string) {
        this.values.set(key, value);
        const request = new FakeRequest();
        request.succeed(key);
        return request as unknown as IDBRequest<IDBValidKey>;
    }

    get(key: string) {
        const request = new FakeRequest();
        request.succeed(this.values.get(key));
        return request as unknown as IDBRequest;
    }

    delete(key: string) {
        this.values.delete(key);
        const request = new FakeRequest();
        request.succeed(undefined);
        return request as unknown as IDBRequest<undefined>;
    }

    count(key: string) {
        const request = new FakeRequest<number>();
        request.succeed(this.values.has(key) ? 1 : 0);
        return request as unknown as IDBRequest<number>;
    }

    getAllKeys() {
        const request = new FakeRequest<IDBValidKey[]>();
        request.succeed(Array.from(this.values.keys()));
        return request as unknown as IDBRequest<IDBValidKey[]>;
    }
}

class FakeTransaction {
    error: Error | null = null;
    onerror: ((event: Event) => void) | null = null;
    onabort: ((event: Event) => void) | null = null;
    private completeHandler: ((event: Event) => void) | null = null;

    constructor(private readonly values: Map<string, unknown>) {}

    set oncomplete(handler: ((event: Event) => void) | null) {
        this.completeHandler = handler;
        if (handler) setTimeout(() => this.completeHandler?.(new Event('complete')), 0);
    }

    get oncomplete() {
        return this.completeHandler;
    }

    objectStore() {
        return new FakeObjectStore(this.values) as unknown as IDBObjectStore;
    }
}

class FakeDatabase {
    objectStoreNames = {
        contains: () => true,
    };

    constructor(private readonly values: Map<string, unknown>) {}

    createObjectStore() {
        return new FakeObjectStore(this.values) as unknown as IDBObjectStore;
    }

    transaction() {
        return new FakeTransaction(this.values) as unknown as IDBTransaction;
    }
}

function installFakeIndexedDb(values: Map<string, unknown>) {
    const db = new FakeDatabase(values);
    vi.stubGlobal('indexedDB', {
        open: () => {
            const request = new FakeRequest<IDBDatabase>();
            queueMicrotask(() => {
                request.result = db as unknown as IDBDatabase;
                request.onsuccess?.(new Event('success'));
            });
            return request as unknown as IDBOpenDBRequest;
        },
    });
}

describe('LocalFileStore', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('persists large local files as IndexedDB chunks', async () => {
        const stored = new Map<string, unknown>();
        installFakeIndexedDb(stored);
        await LocalFileStore.clear();

        const bytes = new Uint8Array(4 * 1024 * 1024 + 17);
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = index % 251;
        }

        await LocalFileStore.save(bytes);
        const loaded = await LocalFileStore.load();

        expect(loaded).toBeDefined();
        expect(loaded).toHaveLength(bytes.length);
        expect(loaded!.slice(0, 64)).toEqual(bytes.slice(0, 64));
        expect(loaded!.slice(-64)).toEqual(bytes.slice(-64));
        expect(stored.has('current')).toBe(false);
        expect(stored.has('current:meta')).toBe(true);
        expect(stored.has('current:chunk:0')).toBe(true);
        expect(stored.has('current:chunk:1')).toBe(true);
    });
});
