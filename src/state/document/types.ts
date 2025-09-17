// Shared types for the document store and gateway
import type { Patch } from 'immer';

export type PatchMeta = {
    label?: string;
    reason?: string;
    user?: string;
    groupId?: string;
    [key: string]: any;
};

export type HistoryEntry<D = unknown> = {
    // Immer patches for forward and backward application
    patches?: Patch[];
    inversePatches?: Patch[];
    meta?: PatchMeta;
    timestamp: number;
};

// Generic gateway interface (implemented in Phase 3)
export interface DocumentStateGateway<D> {
    get(): D;
    replace(next: D, meta?: PatchMeta): void;
    apply(patches: any[], meta?: PatchMeta): void;
    snapshot(): D;
    serialize(doc?: D): string;
    deserialize(json: string): D;
}

// Current app "document" model mirrors what we persist today (timeline slices + scene envelope fields).
// We keep this intentionally loose in Phase 1; it will be refined as phases land.
export interface SceneDoc {
    elements: any[];
    sceneSettings?: any;
    macros?: any;
}

// Minimal timeline slice we persist today. Mirrors export.ts structure.
export interface TimelineDoc {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: any[];
        currentTick: number;
        globalBpm: number;
        beatsPerBar: number;
        playheadAuthority?: 'tick' | 'seconds' | 'clock' | 'user';
    };
    tracks: Record<string, any>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartTick?: number;
        loopEndTick?: number;
        rate: number;
        quantize: 'off' | 'bar';
    };
    selection: { selectedTrackIds: string[] };
    timelineView: { startTick: number; endTick: number };
    playbackRange?: { startTick?: number; endTick?: number };
    playbackRangeUserDefined: boolean;
    midiCache: Record<string, any>;
    rowHeight: number;
}

// Phase 1 DocumentState is simply { timeline + scene }. Future phases may split further.
export interface DocumentStateV1 {
    timeline: TimelineDoc;
    scene: SceneDoc;
}
