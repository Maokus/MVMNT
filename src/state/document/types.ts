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

export type HistoryEventType = 'commit' | 'undo' | 'redo' | 'replace' | 'beginGroup' | 'endGroup' | 'capTrim';

export type HistoryLogEvent<D = unknown> = {
    type: HistoryEventType;
    meta?: PatchMeta;
    historyLength: number; // length of past stack after the operation
    redoLength: number; // length of future stack after the operation
    timestamp: number;
    groupActive: boolean;
    lastEntry?: HistoryEntry<D>;
};

// Generic gateway interface for document access and persistence
export interface DocumentStateGateway<D> {
    get(): D;
    replace(next: D, meta?: PatchMeta): void;
    apply(patches: any[], meta?: PatchMeta): void;
    snapshot(): D;
    serialize(doc?: D): string;
    deserialize(json: string): D;
}

// Current app "document" model mirrors what we persist today (timeline slices + scene envelope fields).
// We keep this intentionally loose; it can be refined as the model evolves.
export interface SceneDoc {
    elements: any[];
    // Phase P1 dual-write structures (will replace `elements` by P13)
    elementsById?: Record<string, any>; // key: element.id -> element
    elementOrder?: string[]; // ordering of element ids
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

// DocumentState is { timeline + scene }. Future iterations may split further.
export interface DocumentStateV1 {
    timeline: TimelineDoc;
    scene: SceneDoc;
}
