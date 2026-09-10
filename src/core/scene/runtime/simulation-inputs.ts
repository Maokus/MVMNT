import type { SceneStoreState } from '@state/sceneStore';
import type { TimelineState } from '@state/timelineStore';
import { createTimingContext, secondsToTicks } from '@state/timelineTime';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { AutomationCurve } from '@automation/automation-curve';
import { createPluginHostServices } from '@core/scene/plugins/host-api/plugin-api';
import { sampleFeatureFrame } from '@audio/audioFeatureUtils';
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { readAudioFeatureMatrix } from '@audio/features/audioFeatureMatrix';
import { getAudioClipsForTrack } from '@state/timeline/audioClips';
import { resolveFeatureTrackFromCache } from '@audio/features/featureTrackIdentity';
import type { ElementContext, ElementPropertyApi, SimulationContext } from '../../../../packages/plugin-sdk/src/scene';
import type { AudioFeatureDemand as FeatureDemand } from '../../../../packages/plugin-sdk/src/audio';
import { err, ok } from '../../../../packages/plugin-sdk/src/api';
import { SimulationPending, simulationStepAt, type SimulationInputs } from './simulation-runner';
import { integratePropertySampler } from './property-integration';

/** Copy data only; stores and their actions are never part of a simulation generation. */
function copy<T>(value: T): T {
    if (!value || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) return (value as any).slice();
    if (value instanceof ArrayBuffer) return value.slice(0) as T;
    if (Array.isArray(value)) return value.map(copy) as T;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, v]) => typeof v !== 'function')
            .map(([k, v]) => [k, copy(v)])
    ) as T;
}

/** Excludes transport, selection, decode LRU timestamps, and analysis progress ticks. */
export function simulationInputIdentity(scene: SceneStoreState, state: TimelineState): unknown[] {
    return [
        scene.graph,
        scene.bindings,
        scene.nodeBindings,
        scene.macros,
        scene.automation,
        scene.settings,
        state.tracks,
        state.tracksOrder,
        state.midiCache,
        state.audioFeatureCaches,
        state.playbackRange,
        state.timeline.globalBpm,
        state.timeline.beatsPerBar,
        state.timeline.masterTempoMap,
        CANONICAL_PPQ,
        ...Object.entries(state.audioCache).flatMap(([id, entry]) => [
            id,
            entry.audioBuffer,
            entry.durationSeconds,
            entry.decodedState,
            entry.originalFile?.storage,
        ]),
        ...Object.entries(state.audioFeatureCacheStatus).flatMap(([id, status]) => [id, status.state]),
    ];
}

export function sameSimulationInputs(a: unknown[], b: unknown[]): boolean {
    return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

export function simulationAuthoredIdentity(scene: SceneStoreState, state: TimelineState): unknown[] {
    return [
        scene.graph,
        scene.bindings,
        scene.nodeBindings,
        scene.macros,
        scene.automation,
        scene.settings,
        state.tracks,
        state.tracksOrder,
        state.midiCache,
        state.playbackRange,
        state.timeline.globalBpm,
        state.timeline.beatsPerBar,
        state.timeline.masterTempoMap,
        ...Object.entries(state.audioCache).flatMap(([id, entry]) => [id, entry.originalFile]),
    ];
}

export class SimulationGeneration {
    readonly timeline: TimelineState;
    readonly services;
    private readonly macros;
    private readonly curves = new Map<string, AutomationCurve>();
    private readonly ppq = CANONICAL_PPQ;
    private readonly missingSources = new Set<string>();
    private activeDemand?: FeatureDemand;

    constructor(scene: SceneStoreState, state: TimelineState) {
        for (const [id, entry] of Object.entries(state.audioCache))
            if (entry.originalFile?.storage === 'missing') this.missingSources.add(id);
        this.macros = copy(scene.macros);
        for (const [id, channel] of Object.entries(copy(scene.automation.channels)))
            this.curves.set(id, new AutomationCurve(channel));
        const audioCache = Object.fromEntries(
            Object.entries(state.audioCache).map(([id, entry]) => {
                const { audioBuffer, originalFile: _file, waveform: _waveform, ...metadata } = entry;
                if (!audioBuffer) return [id, copy(metadata)];
                const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
                    audioBuffer.getChannelData(index).slice()
                );
                const buffer = {
                    sampleRate: audioBuffer.sampleRate,
                    length: audioBuffer.length,
                    duration: audioBuffer.duration,
                    numberOfChannels: channels.length,
                    getChannelData: (index: number) => channels[index],
                } as AudioBuffer;
                return [id, { ...copy(metadata), audioBuffer: buffer }];
            })
        );
        this.timeline = {
            timeline: copy(state.timeline),
            tracks: copy(state.tracks),
            tracksOrder: [...state.tracksOrder],
            midiCache: copy(state.midiCache),
            audioCache,
            audioFeatureCaches: copy(state.audioFeatureCaches),
            audioFeatureCacheStatus: copy(state.audioFeatureCacheStatus),
            hybridCacheRollout: { adapterEnabled: true, fallbackLog: [] },
            timelineView: copy(state.timelineView),
            transport: copy(state.transport),
            playbackRange: copy(state.playbackRange),
        } as unknown as TimelineState;
        const read: NonNullable<Parameters<typeof createPluginHostServices>[0]>['getFeatureData'] = (
            _element,
            trackId,
            feature,
            time,
            sampling
        ) => {
            if (!trackId) return null;
            const key = typeof feature === 'string' ? feature : ((feature as any).key ?? feature.featureKey);
            const demand = this.activeDemand;
            const descriptor = createFeatureDescriptor({
                feature: key,
                profile: demand?.profile,
                profileParams: demand?.profileParams,
                bandIndex: demand?.bandIndex,
            }).descriptor;
            const sample = sampleFeatureFrame(trackId, descriptor, time, sampling, this.timeline, this.ppq);
            return sample
                ? { values: sample.values, metadata: { descriptor, frame: sample, channels: sample.channels } }
                : null;
        };
        this.services = createPluginHostServices({
            timelineStore: { getState: () => this.timeline },
            getFeatureData: read,
            getFeatureDataRange: (element, trackId, feature, start, end, step, sampling) => {
                const count = Math.round((end - start) / step) + 1;
                if (!Number.isSafeInteger(count) || count > 1_048_576)
                    throw new Error('Simulation audio window is too large');
                return Array.from({ length: count }, (_, index) => {
                    const time = start + index * step;
                    const result = read(element, trackId, feature, time, sampling);
                    if (!result) throw new SimulationPending('Audio feature is not ready');
                    return { time, result };
                });
            },
        }).services;
        this.services.audio.sampleFeatureMatrix = (args) =>
            readAudioFeatureMatrix(this.timeline, { ...args, ticksPerQuarter: this.ppq });
    }

    /** Fill unavailable artifacts without replacing already captured, ready source content. */
    withReadyInputs(scene: SceneStoreState, next: TimelineState): SimulationGeneration {
        const previous = this.timeline;
        const audioCache = Object.fromEntries(
            Object.entries(previous.audioCache).map(([id, entry]) => [
                id,
                entry.audioBuffer ? entry : (next.audioCache[id] ?? entry),
            ])
        );
        const audioFeatureCaches = { ...previous.audioFeatureCaches };
        const audioFeatureCacheStatus = { ...previous.audioFeatureCacheStatus };
        for (const id of Object.keys(audioCache)) {
            const ready =
                previous.audioFeatureCacheStatus[id]?.state === 'ready' ? previous.audioFeatureCaches[id] : undefined;
            const incoming = next.audioFeatureCaches[id];
            if (incoming)
                audioFeatureCaches[id] = ready
                    ? {
                          ...incoming,
                          featureTracks: { ...incoming.featureTracks, ...ready.featureTracks },
                          analysisProfiles: { ...incoming.analysisProfiles, ...ready.analysisProfiles },
                      }
                    : incoming;
            if (next.audioFeatureCacheStatus[id]) audioFeatureCacheStatus[id] = next.audioFeatureCacheStatus[id];
        }
        return new SimulationGeneration(scene, {
            ...previous,
            audioCache,
            audioFeatureCaches,
            audioFeatureCacheStatus,
        });
    }

    properties(
        config: Record<string, any>,
        keys: readonly string[]
    ): { api: ElementPropertyApi<any>; propsAt: SimulationInputs['propsAt'] } {
        const bindings = copy(config);
        const valueAt = (key: string, seconds: number) => {
            if (!keys.includes(key) || !Number.isFinite(seconds))
                return err({ code: 'INVALID_ARGUMENT', message: 'Invalid simulation property read' });
            const binding = bindings[key];
            const value =
                binding?.type === 'constant'
                    ? binding.value
                    : binding?.type === 'macro'
                      ? this.macros.byId[binding.macroId]?.value
                      : binding?.type === 'keyframes'
                        ? this.curves
                              .get(binding.channelId)
                              ?.evaluate(secondsToTicks(createTimingContext(this.timeline.timeline, this.ppq), seconds))
                        : binding;
            return value === undefined
                ? err({ code: 'NOT_FOUND', message: `Missing simulation property '${key}'` })
                : ok(copy(value));
        };
        const integrate: ElementPropertyApi<any>['integrate'] = (key, range, options) => {
            const result = integratePropertySampler(
                (seconds) => {
                    const result = valueAt(String(key), seconds);
                    return result.ok && typeof result.value === 'number' && Number.isFinite(result.value)
                        ? { ok: true, value: result.value }
                        : { ok: false, message: 'Property is not a finite number' };
                },
                range.startSeconds,
                range.endSeconds,
                options
            );
            return result.ok
                ? ok(result.value)
                : err({ code: 'INVALID_ARGUMENT', message: 'Invalid property integration' });
        };
        return {
            api: {
                valueAt: (key, seconds) => valueAt(String(key), seconds),
                integrate,
                average(key, range, options) {
                    const duration = range.endSeconds - range.startSeconds;
                    if (!(duration > 0))
                        return err({ code: 'INVALID_ARGUMENT', message: 'Average requires a nonempty range' });
                    const result = integrate(key, range, options);
                    return result.ok ? ok(result.value / duration) : result;
                },
            },
            propsAt(seconds) {
                return Object.freeze(
                    Object.fromEntries(
                        keys.map((key) => {
                            const result = valueAt(key, seconds);
                            if (!result.ok) throw new Error(result.error.message);
                            return [key, result.value];
                        })
                    )
                );
            },
        };
    }

    private checkAudio(method: string, args: any, demands: readonly FeatureDemand[]): void {
        const trackId = typeof args === 'string' ? args : args.trackId;
        const track = this.timeline.tracks[trackId];
        if (!track || track.type !== 'audio') throw new Error(`Simulation audio track '${trackId}' is missing`);
        const feature = typeof args.feature === 'string' ? args.feature : args.feature?.key;
        this.activeDemand = demands.find((demand) => demand.trackId === trackId && demand.feature === feature);
        for (const clip of getAudioClipsForTrack(track)) {
            if (clip.enabled === false) continue;
            const source = this.timeline.audioCache[clip.sourceId];
            if (!source || source.decodedState === 'failed' || this.missingSources.has(clip.sourceId))
                throw new Error(`Audio source '${clip.sourceId}' is missing or failed`);
            if (method.startsWith('sampleFeature')) {
                const status = this.timeline.audioFeatureCacheStatus[clip.sourceId]?.state;
                if (status === 'failed') throw new Error(`Audio analysis failed for '${clip.sourceId}'`);
                if (!resolveFeatureTrackFromCache(this.timeline.audioFeatureCaches[clip.sourceId], feature).track) {
                    if (!demands.some((demand) => demand.trackId === trackId && demand.feature === feature))
                        throw new Error(`Declare an audioFeatureDemands entry for '${feature}' on '${trackId}'`);
                    throw new SimulationPending(`Audio analysis pending for '${clip.sourceId}'`);
                }
                if (status === 'pending' || status === 'stale')
                    throw new SimulationPending('Audio analysis is pending');
            } else if (!source.audioBuffer) {
                if (source.decodedState !== 'decoding')
                    throw new Error(
                        `Audio source '${clip.sourceId}' has no decoded samples. Reload it before simulating.`
                    );
                throw new SimulationPending(`Audio decoding pending for '${clip.sourceId}'`);
            }
        }
    }

    inputs(
        context: ElementContext<any>,
        propsAt: SimulationInputs['propsAt'],
        demands: (props: any) => readonly FeatureDemand[]
    ): SimulationInputs {
        let readFailure: Error | undefined;
        const guard = (facet: any, kind: string, props: any): any =>
            facet &&
            Object.freeze(
                Object.fromEntries(
                    Object.entries(facet).map(([name, fn]) => [
                        name,
                        (...args: any[]) => {
                            try {
                                if (kind === 'audio') this.checkAudio(name, args[0], demands(props));
                                const result = (fn as Function)(...args);
                                if (!result.ok)
                                    throw result.error.code === 'RESOURCE_UNAVAILABLE'
                                        ? new SimulationPending(result.error.message)
                                        : new Error(result.error.message);
                                return result;
                            } catch (error) {
                                const failure = error instanceof Error ? error : new Error(String(error));
                                if (!readFailure || readFailure instanceof SimulationPending) readFailure = failure;
                                return err({
                                    code:
                                        readFailure instanceof SimulationPending
                                            ? 'RESOURCE_UNAVAILABLE'
                                            : 'INVALID_ARGUMENT',
                                    message: readFailure.message,
                                });
                            }
                        },
                    ])
                )
            );
        return {
            identity: {},
            propsAt,
            checkReads() {
                if (readFailure) throw readFailure;
            },
            contextAt: (step, dt) => {
                readFailure = undefined;
                const props = propsAt(step * dt);
                const timeline = guard(context.timeline, 'timeline', props);
                const result: SimulationContext<any> = {
                    timeline,
                    audio: guard(context.audio, 'audio', props),
                    timing: guard(context.timing, 'timing', props),
                    midi: context.midi,
                    properties: guard(context.properties, 'properties', props),
                    noteOns(trackIds) {
                        if (!timeline) {
                            readFailure = new Error('noteOns requires timeline.read');
                            return err({ code: 'CAPABILITY_UNAVAILABLE', message: readFailure.message });
                        }
                        const events = timeline.selectNotes({
                            trackIds,
                            startSeconds: step * dt,
                            endSeconds: (step + 1) * dt,
                        });
                        return events.ok
                            ? ok(
                                  events.value.filter(
                                      (note: any) =>
                                          note.startSeconds >= 0 && simulationStepAt(note.startSeconds, dt) === step
                                  )
                              )
                            : events;
                    },
                };
                return Object.freeze(result);
            },
        };
    }
}
