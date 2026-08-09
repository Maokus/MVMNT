import type { AudioFeatureCacheStatus, AudioFeatureCacheStatusState } from '@audio/features/audioFeatureTypes';
import type { TempoMapEntry } from '@state/timelineTypes';
import { beatsToTicks } from '../timelineTime';
import { quantizeSettingToBeats, type QuantizeSetting } from './quantize';
import { createTimelineTimingContext, getSharedTimingManager } from './timelineShared';
import type { TimelineState } from './storeTypes';

type TransportSlice = Pick<
    TimelineState,
    | 'setMasterTempoMap'
    | 'setGlobalBpm'
    | 'setBeatsPerBar'
    | 'setCurrentTick'
    | 'play'
    | 'pause'
    | 'togglePlay'
    | 'seekTick'
    | 'scrubTick'
    | 'setRate'
    | 'setQuantize'
    | 'setArbitrarySnapN'
    | 'setAdaptiveSnap'
    | 'setAutoKeying'
    | 'setLoopEnabled'
    | 'setLoopRangeTicks'
    | 'toggleLoop'
>;

type TimelineSet = (updater: (state: TimelineState) => Partial<TimelineState> | TimelineState) => void;

interface TransportSliceDependencies {
    set: TimelineSet;
    get: () => TimelineState;
    markAllAudioFeatureStatuses: (
        status: TimelineState['audioFeatureCacheStatus'],
        nextState: AudioFeatureCacheStatusState,
        message: string
    ) => Record<string, AudioFeatureCacheStatus>;
}

/** Creates transport/tempo actions without importing the timeline-store singleton. */
export function createTransportSlice({
    set,
    get,
    markAllAudioFeatureStatuses,
}: TransportSliceDependencies): TransportSlice {
    return {
        setMasterTempoMap(map?: TempoMapEntry[]) {
            set((state) => {
                const next: TimelineState = { ...state, timeline: { ...state.timeline, masterTempoMap: map } };
                if (Object.keys(state.audioFeatureCacheStatus).length) {
                    next.audioFeatureCacheStatus = markAllAudioFeatureStatuses(
                        state.audioFeatureCacheStatus,
                        'stale',
                        'tempo map updated'
                    );
                }
                try {
                    getSharedTimingManager().setTempoMap(map, 'seconds');
                } catch {
                    // Timing propagation is best-effort while constructing isolated stores.
                }
                return next;
            });
        },
        setGlobalBpm(bpm: number) {
            const value = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
            set((state) => {
                const next: TimelineState = {
                    ...state,
                    timeline: { ...state.timeline, globalBpm: value },
                };
                if (state.timeline.globalBpm !== value && Object.keys(state.audioFeatureCacheStatus).length) {
                    next.audioFeatureCacheStatus = markAllAudioFeatureStatuses(
                        state.audioFeatureCacheStatus,
                        'stale',
                        'tempo updated'
                    );
                }
                try {
                    getSharedTimingManager().setBPM(value);
                } catch {
                    // Timing propagation is best-effort while constructing isolated stores.
                }
                return next;
            });
        },
        setBeatsPerBar(value: number) {
            const beatsPerBar = Math.max(1, Math.floor(value || 4));
            set((state) => ({ timeline: { ...state.timeline, beatsPerBar } }));
        },
        setCurrentTick(tick, authority = 'tick') {
            set((state) => {
                let currentTick = Math.max(0, tick);
                if (
                    authority === 'clock' &&
                    !state.transport.isPlaying &&
                    state.transport.state === 'paused' &&
                    currentTick === state.timeline.currentTick
                ) {
                    return { timeline: { ...state.timeline } };
                }
                if (
                    state.transport.loopEnabled &&
                    typeof state.transport.loopStartTick === 'number' &&
                    typeof state.transport.loopEndTick === 'number' &&
                    currentTick > state.transport.loopEndTick
                ) {
                    currentTick = state.transport.loopStartTick;
                }
                return { timeline: { ...state.timeline, currentTick, playheadAuthority: authority } };
            });
        },
        play() {
            set((state) => {
                let currentTick = state.timeline.currentTick;
                if (!state.transport.isPlaying && state.transport.quantize !== 'off') {
                    const beatLength = quantizeSettingToBeats(state.transport.quantize, state.timeline.beatsPerBar);
                    const ticksPerUnit = beatLength
                        ? Math.max(1, Math.round(beatsToTicks(createTimelineTimingContext(state), beatLength)))
                        : null;
                    if (ticksPerUnit) {
                        const snapped = Math.floor(currentTick / ticksPerUnit) * ticksPerUnit;
                        if (snapped !== currentTick) {
                            currentTick = snapped;
                            try {
                                window.dispatchEvent(
                                    new CustomEvent('timeline-play-snapped', { detail: { tick: currentTick } })
                                );
                            } catch {
                                // Window events are unavailable in isolated stores.
                            }
                        }
                    }
                }
                return {
                    timeline: { ...state.timeline, currentTick },
                    transport: { ...state.transport, isPlaying: true, state: 'playing' },
                };
            });
        },
        pause() {
            set((state) => ({ transport: { ...state.transport, isPlaying: false, state: 'paused' } }));
        },
        togglePlay() {
            const isPlaying = get().transport.isPlaying;
            set((state) => ({
                transport: { ...state.transport, isPlaying: !isPlaying, state: isPlaying ? 'paused' : 'playing' },
            }));
        },
        seekTick(tick) {
            set((state) => ({
                timeline: { ...state.timeline, currentTick: Math.max(0, tick), playheadAuthority: 'user' },
                transport: {
                    ...state.transport,
                    isPlaying: false,
                    state: state.transport.isPlaying ? 'paused' : 'seeking',
                },
            }));
        },
        scrubTick(tick) {
            get().setCurrentTick(tick, 'user');
        },
        setRate(rate) {
            const value = Number.isFinite(rate) && rate > 0 ? rate : 1;
            set((state) => ({ transport: { ...state.transport, rate: value } }));
        },
        setQuantize(value: QuantizeSetting) {
            const allowed: QuantizeSetting[] = [
                'off',
                'bar',
                'quarter',
                'quarter-triplet',
                'eighth',
                'eighth-triplet',
                'sixteenth',
                'sixteenth-triplet',
                'thirty-second',
                'sixty-fourth',
                'arbitrary',
            ];
            const quantize = allowed.includes(value) ? value : 'off';
            set((state) => ({ transport: { ...state.transport, quantize } }));
        },
        setArbitrarySnapN(value) {
            const arbitrarySnapN = Number.isFinite(value) && value >= 1 ? Math.round(value) : 8;
            set((state) => ({ transport: { ...state.transport, arbitrarySnapN } }));
        },
        setAdaptiveSnap(adaptiveSnap) {
            set((state) => ({ transport: { ...state.transport, adaptiveSnap } }));
        },
        setAutoKeying(autoKeying) {
            set((state) => ({ transport: { ...state.transport, autoKeying } }));
        },
        setLoopEnabled(loopEnabled) {
            set((state) => ({ transport: { ...state.transport, loopEnabled } }));
        },
        setLoopRangeTicks(startTick, endTick) {
            set((state) => ({
                transport: {
                    ...state.transport,
                    loopStartTick: startTick ?? state.transport.loopStartTick,
                    loopEndTick: endTick ?? state.transport.loopEndTick,
                },
            }));
        },
        toggleLoop() {
            set((state) => ({ transport: { ...state.transport, loopEnabled: !state.transport.loopEnabled } }));
        },
    };
}
