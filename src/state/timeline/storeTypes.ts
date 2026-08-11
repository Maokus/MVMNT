import type { MIDIData } from '@core/types';
import type { AudioTrack, AudioCacheEntry, AudioCacheOriginalFile, AudioCacheWaveform } from '@audio/audioTypes';
import type {
    AudioFeatureCache,
    AudioFeatureCacheStatus,
    AudioFeatureCacheStatusProgress,
    AudioFeatureCacheStatusState,
    AudioAnalysisProfileOverrides,
} from '@audio/features/audioFeatureTypes';
import type { TempoAlignedAdapterDiagnostics } from '@audio/features/tempoAlignedViewAdapter';
import type { TempoMapEntry, NoteRaw, CCEventRaw, MidiCacheBounds } from '@state/timelineTypes';
import type { TempoKeyframe } from '@core/timing/types';
import type { QuantizeSetting } from './quantize';
import type { MidiClip } from './midiClips';
import type {
    AddMidiClipPayload,
    RemoveMidiClipsPayload,
    SetMultipleMidiClipOffsetsPayload,
    UpdateMidiClipsPayload,
    MoveMidiClipsBetweenTracksPayload,
} from './commands/midiClipCommands';
import type {
    AddAudioClipPayload,
    MoveAudioClipsBetweenTracksPayload,
    RemoveAudioClipsPayload,
    SetMultipleAudioClipOffsetsPayload,
    UpdateAudioClipsPayload,
} from './commands/audioClipCommands';

export type TimelineTrack = {
    id: string;
    name: string;
    type: 'midi';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    clips?: MidiClip[];
    // Legacy MIDI placement fields retained for old documents and current single-clip UI.
    offsetTicks?: number;
    regionStartTick?: number;
    regionEndTick?: number;
    midiSourceId?: string;
};

export interface HybridCacheFallbackEvent {
    trackId: string;
    sourceId?: string;
    featureKey: string;
    reason: string;
    timestamp: number;
}

export type TimelineState = {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: TempoMapEntry[];
        currentTick: number; // canonical playhead position in ticks
        globalBpm: number; // fallback bpm for conversions when map is empty
        beatsPerBar: number; // global meter (constant for now)
        playheadAuthority?: 'tick' | 'seconds' | 'clock' | 'user'; // last domain that authored the playhead
        tempoAutomation?: {
            enabled: boolean;
            keyframes: TempoKeyframe[];
            laneVisible?: boolean;
        };
    };
    tracks: Record<string, TimelineTrack | AudioTrack>;
    tracksOrder: string[];
    transport: {
        state?: 'idle' | 'playing' | 'paused' | 'seeking';
        isPlaying: boolean;
        loopEnabled: boolean;
        loopStartTick?: number; // canonical loop start
        loopEndTick?: number; // canonical loop end
        rate: number; // playback rate factor (inactive until wired to visualizer/worker)
        quantize: QuantizeSetting; // snap denomination for transport interactions
        adaptiveSnap: boolean; // when true, snap denominator and grid lines adapt to zoom level
        arbitrarySnapN: number; // denominator N for 'arbitrary' snap mode (snap to 1/N of a bar)
        autoKeying: boolean; // when true, property changes automatically create keyframes
    };
    // UI view window in ticks
    timelineView: { startTick: number; endTick: number };
    // Real playback range braces (yellow) in ticks. Optional; when unset, fallback to timelineView.
    playbackRange?: { startTick?: number; endTick?: number };
    // Marks that user explicitly set the playbackRange (scene start/end). When false, system may auto-adjust
    playbackRangeUserDefined: boolean;
    midiCache: Record<
        string,
        {
            midiData: MIDIData;
            notesRaw: NoteRaw[];
            ccRaw: CCEventRaw[];
            ticksPerQuarter: number;
            tempoMap?: TempoMapEntry[];
            bounds?: MidiCacheBounds;
        }
    >;
    audioCache: Record<string, AudioCacheEntry>;
    audioFeatureCaches: Record<string, AudioFeatureCache>;
    audioFeatureCacheStatus: Record<string, AudioFeatureCacheStatus>;
    hybridCacheRollout: {
        adapterEnabled: boolean;
        fallbackLog: HybridCacheFallbackEvent[];
    };
    tempoAlignedDiagnostics: Record<string, TempoAlignedAdapterDiagnostics>;
    // UI preferences
    rowHeight: number; // track row height in px
    /** Session-only test-synth routing. This is deliberately not part of a track/document. */
    midiPreviewTrackIds: Record<string, true>;

    // Actions
    addMidiTrack: (input: {
        name: string;
        file?: File;
        midiData?: MIDIData;
        offsetTicks?: number;
        clipName?: string;
    }) => Promise<string>;
    addMidiClip: (input: AddMidiClipPayload) => Promise<string>;
    removeMidiClips: (input: RemoveMidiClipsPayload) => Promise<void>;
    updateMidiClip: (input: UpdateMidiClipsPayload['updates'][number]) => Promise<void>;
    updateMidiClips: (input: UpdateMidiClipsPayload) => Promise<void>;
    setMultipleMidiClipOffsets: (input: SetMultipleMidiClipOffsetsPayload) => Promise<void>;
    moveMidiClipsBetweenTracks: (input: MoveMidiClipsBetweenTracksPayload) => Promise<void>;
    addAudioClip: (input: AddAudioClipPayload) => Promise<string>;
    removeAudioClips: (input: RemoveAudioClipsPayload) => Promise<void>;
    updateAudioClip: (input: UpdateAudioClipsPayload['updates'][number]) => Promise<void>;
    updateAudioClips: (input: UpdateAudioClipsPayload) => Promise<void>;
    setMultipleAudioClipOffsets: (input: SetMultipleAudioClipOffsetsPayload) => Promise<void>;
    moveAudioClipsBetweenTracks: (input: MoveAudioClipsBetweenTracksPayload) => Promise<void>;
    addAudioTrack: (input: {
        name: string;
        file?: File;
        buffer?: AudioBuffer;
        offsetTicks?: number;
        clipName?: string;
    }) => Promise<string>;
    removeTrack: (id: string) => void;
    removeTracks: (ids: string[]) => void; // batch removal (single undo snapshot)
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => Promise<void>;
    setTrackOffsetTicks: (id: string, offsetTicks: number) => Promise<void>;
    setMultipleTrackOffsetTicks: (offsets: Array<{ trackId: string; offsetTicks: number }>) => Promise<void>;
    setTrackRegionTicks: (id: string, startTick?: number, endTick?: number) => Promise<void>;
    setTrackEnabled: (id: string, enabled: boolean) => Promise<void>;
    setTrackMute: (id: string, mute: boolean) => Promise<void>;
    setTrackSolo: (id: string, solo: boolean) => Promise<void>;
    setTrackGain: (id: string, gain: number) => Promise<void>; // audio only
    setMidiPreviewEnabled: (id: string, enabled: boolean) => void;
    toggleMidiPreview: (id: string) => void;
    setMasterTempoMap: (map?: TempoMapEntry[]) => void;
    setGlobalBpm: (bpm: number) => void;
    setBeatsPerBar: (n: number) => void;
    setCurrentTick: (tick: number, authority?: 'tick' | 'seconds' | 'clock' | 'user') => void; // dual-write API
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekTick: (tick: number) => void;
    scrubTick: (tick: number) => void;
    setRate: (rate: number) => void;
    setQuantize: (q: QuantizeSetting) => void;
    setArbitrarySnapN: (n: number) => void;
    setAdaptiveSnap: (v: boolean) => void;
    setAutoKeying: (v: boolean) => void;
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRangeTicks: (startTick?: number, endTick?: number) => void;
    toggleLoop: () => void;
    reorderTracks: (order: string[]) => Promise<void>;
    setTimelineViewTicks: (startTick: number, endTick: number) => void;
    _clipGroupDrag: { delta: number; trackIds: string[] } | null;
    _setClipGroupDrag: (drag: { delta: number; trackIds: string[] } | null) => void;
    _crossTrackDrag: {
        kind?: 'midi' | 'audio';
        previews: Array<{
            kind?: 'midi' | 'audio';
            clipId: string;
            sourceTrackId: string;
            targetTrackId: string;
            previewOffsetTicks: number;
            sourceId: string;
            regionStartTick?: number;
            regionEndTick?: number;
        }>;
        targetTrackId: string;
    } | null;
    _setCrossTrackDrag: (drag: TimelineState['_crossTrackDrag']) => void;
    setPlaybackRangeTicks: (startTick?: number, endTick?: number) => void;
    setPlaybackRangeExplicitTicks: (startTick?: number, endTick?: number) => void;
    setRowHeight: (h: number) => void;
    ingestMidiToCache: (
        id: string,
        data: {
            midiData: MIDIData;
            notesRaw: NoteRaw[];
            ccRaw?: CCEventRaw[];
            ticksPerQuarter: number;
            tempoMap?: TempoMapEntry[];
        }
    ) => void;
    ingestAudioToCache: (
        id: string,
        buffer: AudioBuffer,
        options?: {
            originalFile?: AudioCacheOriginalFile;
            waveform?: AudioCacheWaveform;
            skipAutoAnalysis?: boolean;
        }
    ) => void;
    rehydrateAudioSource: (id: string) => Promise<boolean>;
    ingestAudioFeatureCache: (id: string, cache: AudioFeatureCache) => void;
    invalidateAudioFeatureCachesByCalculator: (calculatorId: string, version: number) => void;
    setAudioFeatureCacheStatus: (
        id: string,
        status: AudioFeatureCacheStatusState,
        message?: string,
        progress?: AudioFeatureCacheStatusProgress | null
    ) => void;
    stopAudioFeatureAnalysis: (id: string) => void;
    restartAudioFeatureAnalysis: (
        id: string,
        analysisProfileId?: string | null,
        profileParams?: AudioAnalysisProfileOverrides
    ) => void;
    reanalyzeAudioFeatureCalculators: (
        id: string,
        calculatorIds: string[],
        analysisProfileId?: string | null,
        profileParams?: AudioAnalysisProfileOverrides
    ) => void;
    removeAudioFeatureTracks: (id: string, featureKeys: string[], analysisProfileId?: string | null) => void;
    clearAudioFeatureCache: (id: string) => void;
    clearAllTracks: () => void;
    resetTimeline: () => void;
    setHybridCacheAdapterEnabled: (enabled: boolean, reason?: string) => void;
    recordHybridCacheFallback: (event: {
        trackId: string;
        sourceId?: string;
        featureKey: string;
        reason: string;
    }) => void;
    recordTempoAlignedDiagnostics: (sourceId: string, diagnostics: TempoAlignedAdapterDiagnostics) => void;
    clearTempoAlignedDiagnostics: (sourceId?: string) => void;
    // Tempo automation actions
    enableTempoAutomation: () => void;
    disableTempoAutomation: () => void;
    addTempoKeyframe: (tick: number, bpm: number) => void;
    removeTempoKeyframe: (tick: number) => void;
    moveTempoKeyframe: (fromTick: number, toTick: number) => void;
    updateTempoKeyframeBpm: (tick: number, bpm: number) => void;
    /** Atomically update a tempo point. Returns false when the target tick is occupied or the base point is moved. */
    updateTempoKeyframe: (fromTick: number, next: { tick: number; bpm: number }) => boolean;
    batchSetTempoKeyframes: (keyframes: TempoKeyframe[]) => void;
    commitTempoKeyframeDrag: (fromTick: number, toTick: number) => void;
    resetTempoAutomationChanges: () => void;
    setTempoLaneVisible: (visible: boolean) => void;
};
