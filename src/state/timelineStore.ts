import { create, type StateCreator } from 'zustand';
import { shallow } from 'zustand/shallow';
import type { MIDIData } from '@core/types';
import type { AudioTrack, AudioCacheEntry, AudioCacheOriginalFile, AudioCacheWaveform } from '@audio/audioTypes';
import type { TempoMapEntry, NoteRaw } from '@state/timelineTypes';
import { quantizeSettingToBeats, type QuantizeSetting } from './timeline/quantize';
import {
    createTimingContext,
    secondsToTicks as timingSecondsToTicks,
    ticksToSeconds as timingTicksToSeconds,
    secondsToBeatsContext,
    beatsToSecondsContext,
    secondsToBars,
    barsToSeconds,
    beatsToTicks,
    ticksToBeats,
} from './timelineTime';
import {
    DEFAULT_TIMING_CONTEXT,
    autoAdjustSceneRangeIfNeeded,
    createTimelineTimingContext,
    getSharedTimingManager,
    makeTimelineTrackId,
} from './timeline/timelineShared';
import { createTimelineCommandGateway } from './timeline/commandGateway';
import type { AddTrackCommandResult } from './timeline/commands/addTrackCommand';
import type {
    TimelineCommandDispatchResult,
    TimelineSerializedCommandDescriptor,
} from './timeline/commandTypes';

export { getSharedTimingManager, sharedTimingManager } from './timeline/timelineShared';

// Timeline base types
// Types are now in timelineTypes.ts

export type TimelineTrack = {
    id: string;
    name: string;
    type: 'midi';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    // Canonical time domain fields
    offsetTicks: number; // canonical track offset in ticks
    // Optional region limits expressed in ticks (inclusive start, exclusive end semantics TBD)
    regionStartTick?: number;
    regionEndTick?: number;
    midiSourceId?: string; // references midiCache key
};

export type TimelineState = {
    timeline: {
        id: string;
        name: string;
        masterTempoMap?: TempoMapEntry[];
        currentTick: number; // canonical playhead position in ticks
        globalBpm: number; // fallback bpm for conversions when map is empty
        beatsPerBar: number; // global meter (constant for now)
        playheadAuthority?: 'tick' | 'seconds' | 'clock' | 'user'; // last domain that authored the playhead
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
    };
    selection: { selectedTrackIds: string[] };
    // UI view window in ticks
    timelineView: { startTick: number; endTick: number };
    // Real playback range braces (yellow) in ticks. Optional; when unset, fallback to timelineView.
    playbackRange?: { startTick?: number; endTick?: number };
    // Marks that user explicitly set the playbackRange (scene start/end). When false, system may auto-adjust
    playbackRangeUserDefined: boolean;
    midiCache: Record<
        string,
        { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    >;
    audioCache: Record<string, AudioCacheEntry>;
    // UI preferences
    rowHeight: number; // track row height in px

    // Actions
    addMidiTrack: (input: { name: string; file?: File; midiData?: MIDIData; offsetTicks?: number }) => Promise<string>;
    addAudioTrack: (input: {
        name: string;
        file?: File;
        buffer?: AudioBuffer;
        offsetTicks?: number;
    }) => Promise<string>;
    removeTrack: (id: string) => void;
    removeTracks: (ids: string[]) => void; // batch removal (single undo snapshot)
    updateTrack: (id: string, patch: Partial<TimelineTrack>) => Promise<void>;
    setTrackOffsetTicks: (id: string, offsetTicks: number) => Promise<void>;
    setTrackRegionTicks: (id: string, startTick?: number, endTick?: number) => Promise<void>;
    setTrackEnabled: (id: string, enabled: boolean) => Promise<void>;
    setTrackMute: (id: string, mute: boolean) => Promise<void>;
    setTrackSolo: (id: string, solo: boolean) => Promise<void>;
    setTrackGain: (id: string, gain: number) => Promise<void>; // audio only
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
    setLoopEnabled: (enabled: boolean) => void;
    setLoopRangeTicks: (startTick?: number, endTick?: number) => void;
    toggleLoop: () => void;
    reorderTracks: (order: string[]) => Promise<void>;
    setTimelineViewTicks: (startTick: number, endTick: number) => void;
    selectTracks: (ids: string[]) => void;
    setPlaybackRangeTicks: (startTick?: number, endTick?: number) => void;
    setPlaybackRangeExplicitTicks: (startTick?: number, endTick?: number) => void;
    setRowHeight: (h: number) => void;
    ingestMidiToCache: (
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) => void;
    ingestAudioToCache: (
        id: string,
        buffer: AudioBuffer,
        options?: { originalFile?: AudioCacheOriginalFile; waveform?: AudioCacheWaveform }
    ) => void;
    clearAllTracks: () => void;
    resetTimeline: () => void;
};

function createInitialTimelineSlice(): Pick<
    TimelineState,
    | 'timeline'
    | 'tracks'
    | 'tracksOrder'
    | 'transport'
    | 'selection'
    | 'midiCache'
    | 'audioCache'
    | 'timelineView'
    | 'playbackRange'
    | 'playbackRangeUserDefined'
    | 'rowHeight'
> {
    return {
        timeline: {
            id: 'tl_1',
            name: 'Main Timeline',
            currentTick: 0,
            globalBpm: 120,
            beatsPerBar: 4,
            playheadAuthority: 'tick',
        },
        tracks: {},
        tracksOrder: [],
        audioCache: {},
        transport: {
            state: 'idle',
            isPlaying: false,
            loopEnabled: false,
            rate: 1.0,
            // Quantize enabled by default (bar snapping)
            quantize: 'bar',
            loopStartTick: Math.round(timingSecondsToTicks(DEFAULT_TIMING_CONTEXT, 2)),
            loopEndTick: Math.round(timingSecondsToTicks(DEFAULT_TIMING_CONTEXT, 5)),
        },
        selection: { selectedTrackIds: [] },
        midiCache: {},
        timelineView: { startTick: 0, endTick: Math.round(beatsToTicks(DEFAULT_TIMING_CONTEXT, 120)) },
        playbackRange: undefined,
        playbackRangeUserDefined: false,
        rowHeight: 30,
    };
}

const storeImpl: StateCreator<TimelineState> = (set, get) => ({
    ...createInitialTimelineSlice(),

    async addMidiTrack(input: {
        name: string;
        file?: File;
        midiData?: MIDIData;
        offsetTicks?: number;
    }) {
        const result = await timelineCommandGateway.dispatchById<AddTrackCommandResult>(
            'timeline.addTrack',
            {
                type: 'midi',
                name: input.name,
                file: input.file,
                midiData: input.midiData,
                offsetTicks: input.offsetTicks,
            },
            { source: 'timeline-store' },
        );
        return result.result?.trackId ?? '';
    },
    async addAudioTrack(input: { name: string; file?: File; buffer?: AudioBuffer; offsetTicks?: number }) {
        const result = await timelineCommandGateway.dispatchById<AddTrackCommandResult>(
            'timeline.addTrack',
            {
                type: 'audio',
                name: input.name,
                file: input.file,
                buffer: input.buffer,
                offsetTicks: input.offsetTicks,
            },
            { source: 'timeline-store' },
        );
        return result.result?.trackId ?? '';
    },

    removeTrack(id: string) {
        if (!id) return;
        const { removeTracks } = get();
        removeTracks([id]);
    },

    // Batch removal utility so multi-delete (keyboard) produces a single state update & undo snapshot.
    removeTracks(ids: string[]) {
        if (!ids || !ids.length) return;
        timelineCommandGateway
            .dispatchById('timeline.removeTracks', { trackIds: ids }, { source: 'timeline-store' })
            .catch((error) => {
                console.error('[timelineStore] removeTracks command failed', error);
            });
    },

    async updateTrack(id: string, patch: Partial<TimelineTrack>) {
        if (!id || !patch) return;
        const propertyPatch: Record<string, unknown> = {};
        if (typeof patch.name === 'string') propertyPatch.name = patch.name;
        if (typeof patch.enabled === 'boolean') propertyPatch.enabled = patch.enabled;
        if (typeof patch.mute === 'boolean') propertyPatch.mute = patch.mute;
        if (typeof patch.solo === 'boolean') propertyPatch.solo = patch.solo;
        if ('regionStartTick' in patch) propertyPatch.regionStartTick = patch.regionStartTick;
        if ('regionEndTick' in patch) propertyPatch.regionEndTick = patch.regionEndTick;

        const tasks: Array<Promise<unknown>> = [];
        if (typeof patch.offsetTicks === 'number') {
            tasks.push(
                timelineCommandGateway.dispatchById(
                    'timeline.setTrackOffsetTicks',
                    { trackId: id, offsetTicks: patch.offsetTicks },
                    { source: 'timeline-store' },
                ),
            );
        }
        if (Object.keys(propertyPatch).length) {
            tasks.push(
                timelineCommandGateway.dispatchById(
                    'timeline.setTrackProperties',
                    {
                        updates: [{ trackId: id, patch: propertyPatch }],
                    },
                    { source: 'timeline-store' },
                ),
            );
        }
        if (!tasks.length) return;
        try {
            await Promise.all(tasks);
        } catch (error) {
            console.error('[timelineStore] updateTrack command failed', error);
            throw error;
        }
    },
    async setTrackOffsetTicks(id: string, offsetTicks: number) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackOffsetTicks',
                { trackId: id, offsetTicks },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] setTrackOffsetTicks command failed', error);
            throw error;
        }
    },
    async setTrackRegionTicks(id: string, startTick?: number, endTick?: number) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                {
                    updates: [
                        {
                            trackId: id,
                            patch: { regionStartTick: startTick, regionEndTick: endTick },
                        },
                    ],
                },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] setTrackRegionTicks command failed', error);
            throw error;
        }
    },

    async setTrackEnabled(id: string, enabled: boolean) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { enabled } }] },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] setTrackEnabled command failed', error);
            throw error;
        }
    },

    async setTrackMute(id: string, mute: boolean) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { mute } }] },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] setTrackMute command failed', error);
            throw error;
        }
    },

    async setTrackSolo(id: string, solo: boolean) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { solo } }] },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] setTrackSolo command failed', error);
            throw error;
        }
    },
    async setTrackGain(id: string, gain: number) {
        if (!id) return;
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.setTrackProperties',
                { updates: [{ trackId: id, patch: { gain } }] },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] setTrackGain command failed', error);
            throw error;
        }
    },

    setMasterTempoMap(map?: TempoMapEntry[]) {
        // When tempo map changes, recompute real-time seconds for beat-based notes in cache
        set((s: TimelineState) => {
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, masterTempoMap: map };
            // Propagate tempo map to shared timing manager for immediate effect in playback clock & UI
            try {
                getSharedTimingManager().setTempoMap(map, 'seconds');
            } catch {
                /* noop */
            }
            // Notes no longer store seconds; conversions happen in selectors.
            return next;
        });
    },

    setGlobalBpm(bpm: number) {
        const v = isFinite(bpm) && bpm > 0 ? bpm : 120;
        // Update global bpm and rescale note seconds if no tempo map (uniform tempo case)
        set((s: TimelineState) => {
            const hadMap = (s.timeline.masterTempoMap?.length || 0) > 0;
            const next: TimelineState = { ...s } as any;
            next.timeline = { ...s.timeline, globalBpm: v };
            // Propagate BPM to shared timing manager so playback rate updates immediately
            try {
                getSharedTimingManager().setBPM(v);
            } catch {
                /* ignore */
            }
            // If a tempo map is present we keep its segment BPMs; only fallback bpm changes effect conversions when map empty.
            // Seconds no longer stored on notes; real-time updates occur via selectors.
            // Recompute audioCache durationTicks so displayed beat length and clip width scale with BPM.
            // Original audioBuffer duration (in seconds) is constant; ticksPerSecond = (bpm * ppq)/60.
            try {
                const timing = createTimingContext(
                    {
                        globalBpm: v,
                        beatsPerBar: s.timeline.beatsPerBar,
                        masterTempoMap: s.timeline.masterTempoMap,
                    },
                    getSharedTimingManager().ticksPerQuarter
                );
                const updatedAudio: Record<string, AudioCacheEntry> = {} as any;
                for (const [id, entry] of Object.entries(next.audioCache)) {
                    if (!entry || !entry.audioBuffer) {
                        updatedAudio[id] = entry as any;
                        continue;
                    }
                    const newDurationTicks = Math.round(timingSecondsToTicks(timing, entry.audioBuffer.duration));
                    updatedAudio[id] = { ...entry, durationTicks: newDurationTicks } as any;
                }
                next.audioCache = updatedAudio;
            } catch {
                /* noop */
            }
            return next;
        });
    },

    setBeatsPerBar(n: number) {
        const v = Math.max(1, Math.floor(n || 4));
        set((s: TimelineState) => ({ timeline: { ...s.timeline, beatsPerBar: v } }));
    },

    setCurrentTick(tick: number, authority: 'tick' | 'seconds' | 'clock' | 'user' = 'tick') {
        set((s: TimelineState) => {
            // Behavior goals:
            // 1. While paused, passive advancement originating from the running render loop / clock.update should not move the store tick.
            // 2. Explicit repositioning (seek/loop wrap) coming from the clock authority SHOULD update even while paused (e.g. tests calling setCurrentTick(500,'clock')).
            // Implementation: if paused and authority==='clock' but tick is identical to currentTick (passive frame), ignore; otherwise apply.
            let nextTick = Math.max(0, tick);
            if (authority === 'clock' && !s.transport.isPlaying && s.transport.state === 'paused') {
                if (nextTick === s.timeline.currentTick) {
                    return { timeline: { ...s.timeline } } as TimelineState; // no-op passive frame
                }
                // Allow change-through for explicit reposition while paused.
            }
            if (
                s.transport.loopEnabled &&
                typeof s.transport.loopStartTick === 'number' &&
                typeof s.transport.loopEndTick === 'number'
            ) {
                if (nextTick > s.transport.loopEndTick) {
                    nextTick = s.transport.loopStartTick;
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: nextTick, playheadAuthority: authority },
            } as TimelineState;
        });
    },

    play() {
        set((s: TimelineState) => {
            // Only apply bar quantization when entering play from a non-playing state AND not immediately after a pause.
            // Previous logic snapped on every play(), so toggling pause/play could shift the playhead forward a bar
            // (observed as a one-bar jump when pausing due to tick->seconds mirror race). We guard by detecting if
            // current tick is already aligned or if we were just playing.
            let curTick = s.timeline.currentTick;
            const wasPlaying = s.transport.isPlaying;
            const quantizeSetting = s.transport.quantize;
            if (!wasPlaying && quantizeSetting !== 'off') {
                const beatLength = quantizeSettingToBeats(quantizeSetting, s.timeline.beatsPerBar);
                const ticksPerUnit = beatLength
                    ? Math.max(1, Math.round(beatsToTicks(createTimelineTimingContext(s), beatLength)))
                    : null;
                if (!ticksPerUnit) {
                    return {
                        timeline: { ...s.timeline, currentTick: curTick },
                        transport: { ...s.transport, isPlaying: true, state: 'playing' },
                    } as TimelineState;
                }
                // Use floor so we never jump the playhead forward past the user's chosen position;
                // this eliminates the visible half-bar forward jump experienced with Math.round.
                const snapped = Math.floor(curTick / ticksPerUnit) * ticksPerUnit;
                if (snapped !== curTick) {
                    curTick = snapped;
                    // Notify runtime (VisualizerContext) to align playback clock
                    // VisualizerContext listens for 'timeline-play-snapped' and issues clock.setTick(snappedTick)
                    // ensuring the PlaybackClock fractional accumulator is cleared.
                    try {
                        window.dispatchEvent(new CustomEvent('timeline-play-snapped', { detail: { tick: curTick } }));
                    } catch {
                        /* ignore */
                    }
                }
            }
            return {
                timeline: { ...s.timeline, currentTick: curTick },
                transport: { ...s.transport, isPlaying: true, state: 'playing' },
            } as TimelineState;
        });
    },
    pause() {
        set((s: TimelineState) => ({ transport: { ...s.transport, isPlaying: false, state: 'paused' } }));
    },
    togglePlay() {
        const wasPlaying = get().transport.isPlaying;
        // Resume from the current playhead position; do NOT jump to view start.
        // This preserves the user's last seek/paused position when starting playback.
        set((s: TimelineState) => ({
            transport: { ...s.transport, isPlaying: !wasPlaying, state: !wasPlaying ? 'playing' : 'paused' },
        }));
    },
    seekTick(tick: number) {
        set((s: TimelineState) => ({
            timeline: { ...s.timeline, currentTick: Math.max(0, tick), playheadAuthority: 'user' },
            transport: { ...s.transport, state: 'seeking' },
        }));
    },
    scrubTick(tick: number) {
        get().setCurrentTick(tick, 'user');
    },

    setRate(rate: number) {
        const r = isFinite(rate) && rate > 0 ? rate : 1.0;
        set((s: TimelineState) => ({ transport: { ...s.transport, rate: r } }));
    },

    setQuantize(q: QuantizeSetting) {
        const allowed: QuantizeSetting[] = ['off', 'bar', 'quarter', 'eighth', 'sixteenth'];
        const next = allowed.includes(q) ? q : 'off';
        set((s: TimelineState) => ({ transport: { ...s.transport, quantize: next } }));
    },

    setLoopEnabled(enabled: boolean) {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: enabled } }));
    },
    setLoopRangeTicks(startTick?: number, endTick?: number) {
        set((s: TimelineState) => ({
            transport: {
                ...s.transport,
                loopStartTick: startTick ?? s.transport.loopStartTick,
                loopEndTick: endTick ?? s.transport.loopEndTick,
            },
        }));
    },

    toggleLoop() {
        set((s: TimelineState) => ({ transport: { ...s.transport, loopEnabled: !s.transport.loopEnabled } }));
    },

    async reorderTracks(order: string[]) {
        try {
            await timelineCommandGateway.dispatchById(
                'timeline.reorderTracks',
                { order },
                { source: 'timeline-store' },
            );
        } catch (error) {
            console.error('[timelineStore] reorderTracks command failed', error);
            throw error;
        }
    },

    setTimelineViewTicks(startTick: number, endTick: number) {
        const MIN = 1; // at least 1 tick
        let sT = Math.min(startTick, endTick);
        let eT = Math.max(startTick, endTick);
        if (eT - sT < MIN) eT = sT + MIN;
        set(() => ({ timelineView: { startTick: sT, endTick: eT } }));
    },

    selectTracks(ids: string[]) {
        set(() => ({ selection: { selectedTrackIds: [...ids] } }));
    },

    ingestMidiToCache(
        id: string,
        data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }
    ) {
        // Update cache; convert beat-based canonical timing to seconds according to current tempo context
        set((s: TimelineState) => {
            const timing = createTimelineTimingContext(s);
            const notes = data.notesRaw.map((n) => {
                if (n.startBeat !== undefined && n.endBeat !== undefined) {
                    const startSec = beatsToSecondsContext(timing, n.startBeat);
                    const endSec = beatsToSecondsContext(timing, n.endBeat);
                    return { ...n, startTime: startSec, endTime: endSec, duration: Math.max(0, endSec - startSec) };
                }
                return n;
            });
            return { midiCache: { ...s.midiCache, [id]: { ...data, notesRaw: notes } } } as TimelineState;
        });
        // Now that notes are available, attempt auto adjust (if not user-defined)
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },
    ingestAudioToCache(id: string, buffer: AudioBuffer, options?: { originalFile?: AudioCacheOriginalFile; waveform?: AudioCacheWaveform }) {
        // Compute duration in ticks using shared timing manager
        try {
            const state = get();
            const durationTicks = Math.round(timingSecondsToTicks(createTimelineTimingContext(state), buffer.duration));
            set((s: TimelineState) => ({
                audioCache: {
                    ...s.audioCache,
                    [id]: {
                        audioBuffer: buffer,
                        durationTicks,
                        sampleRate: buffer.sampleRate,
                        channels: buffer.numberOfChannels,
                        durationSeconds: buffer.duration,
                        durationSamples: buffer.length,
                        originalFile: options?.originalFile,
                        waveform: options?.waveform,
                    },
                },
                tracks: {
                    ...s.tracks,
                    [id]: { ...(s.tracks[id] as any), audioSourceId: id },
                },
            }));
            // Kick off async peak extraction (non-blocking)
            (async () => {
                try {
                    const { extractPeaksAsync } = await import('@audio/waveform/peak-extractor');
                    const res = await extractPeaksAsync(buffer, { binSize: 1024, maxBins: 5000 });
                    set((s: TimelineState) => {
                        const existing = s.audioCache[id];
                        if (!existing || existing.waveform?.channelPeaks) {
                            return { audioCache: s.audioCache } as TimelineState;
                        }
                        const waveform: AudioCacheWaveform = {
                            version: 1,
                            channelPeaks: res.peaks,
                            sampleStep: res.binSize ?? Math.max(1, Math.floor(buffer.length / res.peaks.length) || 1),
                        };
                        return {
                            audioCache: {
                                ...s.audioCache,
                                [id]: { ...existing, waveform },
                            },
                        } as TimelineState;
                    });
                } catch (err) {
                    // Peak extraction failure is non-fatal.
                    // console.debug('Peak extraction skipped', err);
                }
            })();
        } catch (err) {
            console.warn('Failed to ingest audio buffer', err);
        }
    },

    clearAllTracks() {
        set((s: TimelineState) => ({
            tracks: {},
            tracksOrder: [],
            selection: { selectedTrackIds: [] },
            midiCache: {},
            audioCache: {},
        }));
        try {
            autoAdjustSceneRangeIfNeeded(get, set);
        } catch {}
    },

    resetTimeline() {
        const initial = createInitialTimelineSlice();
        set(() => initial);
        try {
            const tm = getSharedTimingManager();
            tm.setBPM(initial.timeline.globalBpm || 120);
            tm.setTempoMap(undefined, 'seconds');
        } catch {}
    },

    setPlaybackRangeTicks(startTick?: number, endTick?: number) {
        set(() => ({
            playbackRange: {
                startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
                endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
            },
        }));
    },
    setPlaybackRangeExplicitTicks(startTick?: number, endTick?: number) {
        set(() => ({
            playbackRange: {
                startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
                endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
            },
            playbackRangeUserDefined: true,
        }));
    },

    setRowHeight(h: number) {
        const minH = 16;
        const maxH = 160;
        const v = Math.max(minH, Math.min(maxH, Math.floor(h)));
        set(() => ({ rowHeight: v }));
    },
});

export const useTimelineStore = create<TimelineState>(storeImpl);

// Convenience shallow selector hook re-export (optional for consumers)
export const useTimelineStoreShallow = <T>(selector: (s: TimelineState) => T) => useTimelineStore(selector, shallow);

export const timelineCommandGateway = createTimelineCommandGateway({
    getState: () => useTimelineStore.getState(),
    setState: (updater) => useTimelineStore.setState(updater as any),
});

export function dispatchTimelineCommandDescriptor<TResult = void>(
    descriptor: TimelineSerializedCommandDescriptor,
): Promise<TimelineCommandDispatchResult<TResult>> {
    return timelineCommandGateway.dispatchDescriptor<TResult>(descriptor);
}
