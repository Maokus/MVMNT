// Minimal document schema & utilities
// The persisted document is pure data. Runtime/UI state lives elsewhere.

export const SCHEMA_VERSION = 1 as const;

// ID generation strategy: use crypto.randomUUID when available, fallback to incrementing counter.
let __idCounter = 0;
export function generateId(prefix = 'id'): string {
    if (typeof globalThis !== 'undefined' && 'crypto' in globalThis && (globalThis as any).crypto?.randomUUID) {
        try {
            return (globalThis as any).crypto.randomUUID();
        } catch {
            // ignore and fall back
        }
    }
    __idCounter += 1;
    return `${prefix}_${__idCounter}`;
}

// Example minimal element/track types (lean). Add fields as needed by later phases.
export interface TimelineElement {
    id: string;
    name: string;
    start: number; // ms
    duration: number; // ms
    // Additional properties can be added in future schema versions.
}

export interface Track {
    id: string;
    name: string;
    elementIds: string[]; // references into elements.byId
}

export interface DocumentRoot {
    schemaVersion: number;
    createdAt: number; // epoch ms (volatile for hash -> will be omitted)
    modifiedAt: number; // epoch ms (volatile for hash -> omitted)
    tracks: {
        byId: Record<string, Track>;
        allIds: string[];
    };
    elements: {
        byId: Record<string, TimelineElement>;
        allIds: string[];
    };
    meta: {
        name: string;
        // Non-volatile fields OK here; add descriptive metadata later as needed.
    };
}

export function createEmptyDocument(): DocumentRoot {
    const now = Date.now();
    return {
        schemaVersion: SCHEMA_VERSION,
        createdAt: now,
        modifiedAt: now,
        tracks: { byId: {}, allIds: [] },
        elements: { byId: {}, allIds: [] },
        meta: { name: 'Untitled Project' },
    };
}

// Utility to deeply clone JSON-compatible data (for safety in migrate; cheap at small scale)
export function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// Rough shape guard (very light) to avoid crashing on totally invalid objects.
function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Migrate raw unknown input to current DocumentRoot.
// For v1 we only ensure required root keys exist and assign defaults. If future version detected -> throw.
export function migrate(raw: unknown): DocumentRoot {
    if (!isRecord(raw)) {
        return createEmptyDocument();
    }
    const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
    if (version > SCHEMA_VERSION) {
        throw new Error(
            `Unsupported future schemaVersion ${version}. Current is ${SCHEMA_VERSION}. Please upgrade application.`
        );
    }
    // Start from deep clone to avoid mutating caller object.
    const working = deepClone(raw);
    if (version < 1) {
        // Initial migration: fill missing keys.
        // No prior versions, so treat as pre-v1 unknown shape.
    }
    const now = Date.now();
    const migrated: DocumentRoot = {
        schemaVersion: SCHEMA_VERSION,
        createdAt: typeof working.createdAt === 'number' ? working.createdAt : now,
        modifiedAt: typeof working.modifiedAt === 'number' ? working.modifiedAt : now,
        tracks: normalizeCollection<Track>(working.tracks, (t) => ({
            id: typeof t.id === 'string' ? t.id : generateId('track'),
            name: typeof t.name === 'string' ? t.name : 'Track',
            elementIds: Array.isArray(t.elementIds) ? t.elementIds.filter((x: any) => typeof x === 'string') : [],
        })),
        elements: normalizeCollection<TimelineElement>(working.elements, (e) => ({
            id: typeof e.id === 'string' ? e.id : generateId('el'),
            name: typeof e.name === 'string' ? e.name : 'Element',
            start: typeof e.start === 'number' ? e.start : 0,
            duration: typeof e.duration === 'number' ? e.duration : 1000,
        })),
        meta: {
            name:
                isRecord(working.meta) && typeof working.meta.name === 'string'
                    ? working.meta.name
                    : 'Untitled Project',
        },
    };
    return migrated;
}

function normalizeCollection<T extends { id: string }>(
    rawSection: any,
    mapFn: (item: any) => T
): { byId: Record<string, T>; allIds: string[] } {
    const byId: Record<string, T> = {};
    const allIds: string[] = [];
    if (isRecord(rawSection)) {
        // Accept either normalized shape already or an array under items/array forms.
        if (Array.isArray((rawSection as any).allIds) && isRecord((rawSection as any).byId)) {
            for (const id of (rawSection as any).allIds) {
                if (typeof id === 'string' && isRecord((rawSection as any).byId[id])) {
                    const mapped = mapFn((rawSection as any).byId[id]);
                    byId[mapped.id] = mapped;
                    allIds.push(mapped.id);
                }
            }
        } else if (Array.isArray((rawSection as any).items)) {
            for (const item of (rawSection as any).items) {
                if (isRecord(item)) {
                    const mapped = mapFn(item);
                    byId[mapped.id] = mapped;
                    allIds.push(mapped.id);
                }
            }
        }
    }
    return { byId, allIds };
}
