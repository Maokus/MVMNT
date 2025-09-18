import { useDocumentStore } from './documentStore';
import type { PatchMeta } from './types';

// Phase 5: Action-only API surface for document mutations.
// UI and components must import from here instead of the raw store.

// Contract: Each action uses documentStore.commit with a descriptive label in meta.

export function setTimelineName(name: string, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            d.timeline.timeline.name = name;
        },
        { label: 'setTimelineName', ...meta }
    );
}

export function setGlobalBpm(bpm: number, meta?: PatchMeta) {
    const v = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    useDocumentStore.getState().commit(
        (d) => {
            d.timeline.timeline.globalBpm = v;
        },
        { label: 'setGlobalBpm', ...meta }
    );
}

export function nudgePlayheadTicks(delta: number, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            d.timeline.timeline.currentTick = Math.max(0, Math.floor(d.timeline.timeline.currentTick + (delta | 0)));
        },
        { label: 'nudgePlayheadTicks', ...meta }
    );
}

export function setPlayheadTick(tick: number, meta?: PatchMeta) {
    const t = Math.max(0, Math.floor(tick));
    useDocumentStore.getState().commit(
        (d) => {
            d.timeline.timeline.currentTick = t;
        },
        { label: 'setPlayheadTick', ...meta }
    );
}

export function addTrack(trackId: string, track: any, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            if (!d.timeline.tracks[trackId]) {
                d.timeline.tracks[trackId] = track;
                d.timeline.tracksOrder.push(trackId);
            }
        },
        { label: 'addTrack', trackId, ...meta }
    );
}

export function removeTrack(trackId: string, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            if (d.timeline.tracks[trackId]) {
                delete d.timeline.tracks[trackId];
                d.timeline.tracksOrder = d.timeline.tracksOrder.filter((id) => id !== trackId);
            }
        },
        { label: 'removeTrack', trackId, ...meta }
    );
}

export function setTransportPlaying(isPlaying: boolean, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            d.timeline.transport.isPlaying = !!isPlaying;
            d.timeline.transport.state = isPlaying ? 'playing' : 'paused';
        },
        { label: 'setTransportPlaying', ...meta }
    );
}

export function addSceneElement(el: any, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            d.scene.elements.push(el);
        },
        { label: 'addSceneElement', id: el?.id, ...meta }
    );
}

export function updateSceneElement(id: string, updater: (el: any) => void, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            const idx = d.scene.elements.findIndex((e: any) => e?.id === id);
            if (idx >= 0) updater(d.scene.elements[idx]);
        },
        { label: 'updateSceneElement', id, ...meta }
    );
}

export function removeSceneElement(id: string, meta?: PatchMeta) {
    useDocumentStore.getState().commit(
        (d) => {
            d.scene.elements = d.scene.elements.filter((e: any) => e?.id !== id);
        },
        { label: 'removeSceneElement', id, ...meta }
    );
}

export function replaceDocument(next: any, meta?: PatchMeta) {
    useDocumentStore.getState().replace(next, { label: 'replaceDocument', ...meta });
}

export function canUndo() {
    return useDocumentStore.getState().canUndo;
}

export function canRedo() {
    return useDocumentStore.getState().canRedo;
}

export function undo() {
    useDocumentStore.getState().undo();
}

export function redo() {
    useDocumentStore.getState().redo();
}

export function getDocumentSnapshot() {
    return useDocumentStore.getState().getSnapshot();
}
