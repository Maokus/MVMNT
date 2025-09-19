// Incremental Reconciler
// Lean reconciler that tracks runtime representations of tracks & elements by ID.
// It preserves object identity for unchanged nodes, creates runtime objects for additions,
// updates existing objects on shallow meaningful property change, and calls dispose on removals.
//
// The runtime object shape here is intentionally minimal; in a fuller system, these could
// be richer classes or adapters into rendering subsystems. For now we store a shallow copy
// plus a version counter to help tests assert update calls.

import type { DocumentRoot, Track, TimelineElement } from './schema';

export interface RuntimeElement {
    id: string;
    data: TimelineElement; // latest snapshot reference (we replace on update)
    version: number; // increments on each update
    dispose(): void;
}

export interface RuntimeTrack {
    id: string;
    data: Track;
    version: number;
    dispose(): void;
}

export interface ReconcilerLifecycleHooks {
    onElementCreate?(el: RuntimeElement): void;
    onElementUpdate?(el: RuntimeElement, prev: TimelineElement, next: TimelineElement): void;
    onElementDispose?(el: RuntimeElement): void;
    onTrackCreate?(tr: RuntimeTrack): void;
    onTrackUpdate?(tr: RuntimeTrack, prev: Track, next: Track): void;
    onTrackDispose?(tr: RuntimeTrack): void;
}

export interface Reconciler {
    reconcile(doc: DocumentRoot): void;
    getElement(id: string): RuntimeElement | undefined;
    getTrack(id: string): RuntimeTrack | undefined;
    snapshotCounts(): { elements: number; tracks: number };
}

interface InternalRuntimeState {
    elements: Map<string, RuntimeElement>;
    tracks: Map<string, RuntimeTrack>;
}

// Shallow meaningful fields for diffing. We intentionally only compare stable, semantic fields
// (ignoring IDs and arrays for tracks we compare elementIds length + membership ordered list).
function elementChanged(a: TimelineElement, b: TimelineElement): boolean {
    return a.name !== b.name || a.start !== b.start || a.duration !== b.duration;
}
function trackChanged(a: Track, b: Track): boolean {
    if (a.name !== b.name) return true;
    if (a.elementIds.length !== b.elementIds.length) return true;
    for (let i = 0; i < a.elementIds.length; i++) if (a.elementIds[i] !== b.elementIds[i]) return true;
    return false;
}

export function createReconciler(hooks: ReconcilerLifecycleHooks = {}): Reconciler {
    const state: InternalRuntimeState = {
        elements: new Map(),
        tracks: new Map(),
    };

    function disposeRemoved<T extends { dispose(): void }>(
        map: Map<string, T>,
        aliveIds: Set<string>,
        onDispose?: (obj: T) => void
    ) {
        for (const [id, obj] of map) {
            if (!aliveIds.has(id)) {
                onDispose?.(obj);
                obj.dispose();
                map.delete(id);
            }
        }
    }

    function reconcile(doc: DocumentRoot) {
        // Tracks
        const trackAlive = new Set<string>();
        for (const id of doc.tracks.allIds) {
            trackAlive.add(id);
            const nextData = doc.tracks.byId[id];
            const existing = state.tracks.get(id);
            if (!existing) {
                const runtime: RuntimeTrack = {
                    id,
                    data: nextData,
                    version: 0,
                    dispose() {},
                };
                state.tracks.set(id, runtime);
                hooks.onTrackCreate?.(runtime);
            } else if (trackChanged(existing.data, nextData)) {
                const prevData = existing.data;
                existing.data = nextData;
                existing.version++;
                hooks.onTrackUpdate?.(existing, prevData, nextData);
            }
        }
        disposeRemoved(state.tracks, trackAlive, (rt) => hooks.onTrackDispose?.(rt));

        // Elements
        const elementAlive = new Set<string>();
        for (const id of doc.elements.allIds) {
            elementAlive.add(id);
            const nextData = doc.elements.byId[id];
            const existing = state.elements.get(id);
            if (!existing) {
                const runtime: RuntimeElement = {
                    id,
                    data: nextData,
                    version: 0,
                    dispose() {},
                };
                state.elements.set(id, runtime);
                hooks.onElementCreate?.(runtime);
            } else if (elementChanged(existing.data, nextData)) {
                const prevData = existing.data;
                existing.data = nextData;
                existing.version++;
                hooks.onElementUpdate?.(existing, prevData, nextData);
            }
        }
        disposeRemoved(state.elements, elementAlive, (re) => hooks.onElementDispose?.(re));
    }

    return {
        reconcile,
        getElement: (id) => state.elements.get(id),
        getTrack: (id) => state.tracks.get(id),
        snapshotCounts: () => ({ elements: state.elements.size, tracks: state.tracks.size }),
    };
}
