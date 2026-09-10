import { BoundSceneElement } from '@core/scene/runtime/bound-scene-element';
import type { EnhancedConfigSchema } from '@core/scene/runtime/schema';
import { insertElementConfig } from '@core/scene/runtime/schema-builders';
import { Rectangle, Text, type RenderObject } from '@core/render/render-objects';
import { BundledGridAtlasHandle, BundledSparrowHandle, BundledSprite } from '@core/resources/bundled-sprite';
import { VisualResourceHandle } from '@core/resources/visual-resource-handle';
import { resolveProjectAssetDescriptor } from '@state/visualAssetRegistryStore';
import {
    PLUGIN_CAPABILITIES,
    type PluginHostServices,
    type PluginHostCapability,
} from '@core/scene/plugins/host-api/plugin-api';
import type {
    CapabilityContext,
    ElementContext,
    ElementCapabilities,
    ElementPropertyApi,
    PluginElementDefinition,
    PropertyIntegrationOptions,
    PropertyTimeRange,
    ResourceContext,
} from '../../../../packages/plugin-sdk/src/scene';
import { err, ok, type PluginDiagnostic, type Result } from '../../../../packages/plugin-sdk/src/api';
import {
    clearDeclarativeAudioFeatureDemands,
    syncDeclarativeAudioFeatureDemands,
} from '@audio/features/declarativeDemands';
import { ensureFontLoaded } from '@fonts/font-loader';
import { renderResourceManager } from '@core/render/render-resource-manager';
import { integratePropertySampler } from '@core/scene/runtime/property-integration';
import type { SceneElementOrigin, SceneElementRegistration } from './types';
import {
    SimulationRunner,
    SIMULATION_PLACEHOLDER_GRACE_MS,
    type SimulationInputs,
    type SimulationReadiness,
    type SimulationStatus,
} from './simulation-runner';
import type { SimulationGeneration } from './simulation-inputs';

const diagnostic = (
    code: PluginDiagnostic['code'],
    message: string,
    operation?: string,
    capability?: PluginHostCapability
): PluginDiagnostic => Object.freeze({ code, message, operation, capability });

const finiteRange = (start: number, end: number, operation: string): Result<true> =>
    Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? ok(true)
        : err(diagnostic('INVALID_ARGUMENT', 'Expected a finite, ordered time range', operation));

const frozenArray = <T extends object>(items: readonly T[]): readonly Readonly<T>[] =>
    Object.freeze(items.map((item) => Object.freeze({ ...item })));

const runtimeNow = () => performance.now();

function conciseReason(reason: string | undefined): string {
    const value = (reason ?? 'Simulation inputs are not ready').replace(/\s+/g, ' ').trim();
    return value.length > 110 ? `${value.slice(0, 107)}…` : value;
}

function renderBounds(objects: readonly RenderObject[]) {
    const bounds = objects
        .map((object) => object.getVisualBounds?.())
        .filter(
            (value): value is { x: number; y: number; width: number; height: number } =>
                !!value && Object.values(value).every(Number.isFinite)
        );
    if (!bounds.length) return undefined;
    const x = Math.min(...bounds.map((value) => value.x));
    const y = Math.min(...bounds.map((value) => value.y));
    const right = Math.max(...bounds.map((value) => value.x + value.width));
    const bottom = Math.max(...bounds.map((value) => value.y + value.height));
    return { x, y, width: right - x, height: bottom - y };
}

function simulationPlaceholder(
    readiness: SimulationReadiness,
    props: Readonly<Record<string, unknown>>,
    previous: readonly RenderObject[] | undefined
): RenderObject[] {
    const previousBounds = previous ? renderBounds(previous) : undefined;
    const configuredWidth = typeof props.width === 'number' && Number.isFinite(props.width) ? props.width : undefined;
    const configuredHeight =
        typeof props.height === 'number' && Number.isFinite(props.height) ? props.height : undefined;
    const width = Math.max(180, previousBounds?.width ?? configuredWidth ?? 260);
    const height = Math.max(90, previousBounds?.height ?? configuredHeight ?? 120);
    const x = previousBounds?.x ?? 0;
    const y = previousBounds?.y ?? 0;
    const failed = readiness.status === 'error';
    const background = new Rectangle(x, y, width, height, {
        fillColor: failed ? 'rgba(69,10,10,0.88)' : 'rgba(69,49,8,0.88)',
        strokeColor: failed ? '#fb7185' : '#fbbf24',
        strokeWidth: 2,
        cornerRadius: 8,
    });
    const title = new Text(
        x + 12,
        y + height / 2 - 13,
        failed ? 'Simulation unavailable' : 'Preparing simulation',
        '600 14px "Inter", sans-serif',
        { color: failed ? '#fecdd3' : '#fef3c7', baseline: 'middle', maxWidth: width - 24 }
    ).setLayoutParticipation('exclude');
    const reason = new Text(
        x + 12,
        y + height / 2 + 13,
        conciseReason(readiness.reason),
        '400 11px "Inter", sans-serif',
        { color: failed ? '#fda4af' : '#fde68a', baseline: 'middle', maxWidth: width - 24 }
    ).setLayoutParticipation('exclude');
    return [background, title, reason];
}

const trackSummary = (track: any) =>
    Object.freeze({
        id: String(track.id),
        name: String(track.name ?? track.id),
        type: ['midi', 'audio', 'automation'].includes(track.type) ? track.type : 'unknown',
        muted: Boolean(track.muted),
        ...(typeof track.color === 'string' ? { color: track.color } : {}),
    });

export interface ScopeOptions {
    pluginId: string;
    /** Fully-qualified scene type used for serialized external-plugin instances. */
    runtimeElementType?: string;
    /** Engine-private dependency injected at the loader/registry boundary. */
    services: PluginHostServices | null;
    /** Host-authoritative grants, sourced from plugin.json or the built-in registry. */
    capabilities?: ElementCapabilities;
    loadAsset(path: string): Promise<string>;
    report(diagnostic: PluginDiagnostic): void;
    synchronousInitialization?: boolean;
}

export interface PluginDefinitionScope {
    readonly definition: PluginElementDefinition<any, any, any, any>;
    readonly ready: Promise<boolean>;
    readonly failure?: PluginDiagnostic;
    createRegistration(origin: SceneElementOrigin, overrideCategory?: string): SceneElementRegistration;
    dispose(): Promise<void>;
}

function publicSchema(schema: EnhancedConfigSchema): EnhancedConfigSchema {
    return {
        ...schema,
        tabs: schema.tabs.map((tab) => ({
            ...tab,
            groups: tab.groups.map((group) => ({
                ...group,
                properties: group.properties.map(({ runtime: _runtime, ...property }) => property),
            })),
        })),
    };
}

function runCleanup(callback: () => void, options: ScopeOptions): void {
    try {
        callback();
    } catch (error) {
        options.report(diagnostic('RESOURCE_UNAVAILABLE', String(error), 'element.cleanup'));
    }
}

function drainCleanups(cleanups: Set<() => void>, options: ScopeOptions): void {
    for (const cleanup of [...cleanups]) {
        cleanups.delete(cleanup);
        runCleanup(cleanup, options);
    }
}

function resourceContext(context: CapabilityContext): ResourceContext {
    return Object.freeze({
        assets: context.assets,
        audioCalculators: context.audioCalculators,
        diagnostics: context.diagnostics,
        signal: context.signal,
        onCleanup: context.onCleanup,
    });
}

function createContext(
    definition: PluginElementDefinition<any, any, any, any>,
    controller: AbortController,
    options: ScopeOptions,
    cleanups: Set<() => void>
): CapabilityContext;
function createContext(
    definition: PluginElementDefinition<any, any, any, any>,
    controller: AbortController,
    options: ScopeOptions,
    cleanups: Set<() => void>,
    properties: ElementPropertyApi<Readonly<Record<string, unknown>>>
): ElementContext<Readonly<Record<string, unknown>>>;
function createContext(
    definition: PluginElementDefinition<any, any, any, any>,
    controller: AbortController,
    options: ScopeOptions,
    cleanups: Set<() => void>,
    properties?: ElementPropertyApi<Readonly<Record<string, unknown>>>
): CapabilityContext | ElementContext<Readonly<Record<string, unknown>>> {
    const host = options.services;
    const declared = new Set([...(options.capabilities?.required ?? []), ...(options.capabilities?.optional ?? [])]);
    const available = new Set(host?.capabilities ?? []);
    const granted = (capability: PluginHostCapability) => declared.has(capability) && available.has(capability);
    const unavailable = <T>(capability: PluginHostCapability, operation: string): Result<T> =>
        err(diagnostic('CAPABILITY_UNAVAILABLE', `Capability '${capability}' is unavailable`, operation, capability));
    const assertActive = () => {
        if (controller.signal.aborted) throw new Error('Cannot allocate resources in an aborted scope');
    };
    const trackVisualHandle = <T extends { destroy(): void }>(handle: T) => {
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            cleanups.delete(dispose);
            handle.destroy();
        };
        cleanups.add(dispose);
        return {
            handle,
            dispose,
            assertActive() {
                assertActive();
                if (disposed) throw new Error('Cannot use a disposed asset handle');
            },
        };
    };

    const context: CapabilityContext = {
        signal: controller.signal,
        onCleanup(callback) {
            let disposed = false;
            const cleanup = () => {
                if (disposed) return;
                disposed = true;
                cleanups.delete(cleanup);
                callback();
            };
            if (controller.signal.aborted) runCleanup(cleanup, options);
            else cleanups.add(cleanup);
        },
        diagnostics: Object.freeze({ report: options.report }),
        ...(properties ? { properties } : {}),
        assets: Object.freeze({
            async load(path: string) {
                if (controller.signal.aborted)
                    return err(diagnostic('ABORTED', 'Asset load was aborted', 'assets.load'));
                if (!path || path.includes('..') || path.startsWith('/')) {
                    return err(
                        diagnostic('INVALID_ARGUMENT', 'Asset path must be a relative archive path', 'assets.load')
                    );
                }
                try {
                    const url = await options.loadAsset(path);
                    if (controller.signal.aborted) {
                        URL.revokeObjectURL(url);
                        return err(diagnostic('ABORTED', 'Asset load was aborted', 'assets.load'));
                    }
                    let disposed = false;
                    const dispose = () => {
                        if (disposed) return;
                        disposed = true;
                        URL.revokeObjectURL(url);
                        cleanups.delete(dispose);
                    };
                    cleanups.add(dispose);
                    return ok(Object.freeze({ url, dispose }));
                } catch (error) {
                    return err(
                        diagnostic('NOT_FOUND', error instanceof Error ? error.message : String(error), 'assets.load')
                    );
                }
            },
            project() {
                assertActive();
                const tracked = trackVisualHandle(new VisualResourceHandle());
                return Object.freeze({
                    update(assetId: string | null) {
                        tracked.assertActive();
                        return Object.freeze({ ...tracked.handle.update(resolveProjectAssetDescriptor(assetId)) });
                    },
                    dispose: tracked.dispose,
                });
            },
            bundledImage(path: string) {
                assertActive();
                const tracked = trackVisualHandle(new BundledSprite(path, loadScopedAsset));
                return Object.freeze({
                    get: () => {
                        tracked.assertActive();
                        return Object.freeze({ ...tracked.handle.get() });
                    },
                    dispose: tracked.dispose,
                });
            },
            bundledSparrow(imagePath: string, xmlPath: string, defaultFps?: number) {
                assertActive();
                const tracked = trackVisualHandle(
                    new BundledSparrowHandle(imagePath, xmlPath, loadScopedAsset, undefined, defaultFps)
                );
                return Object.freeze({
                    get: () => {
                        tracked.assertActive();
                        return Object.freeze({ ...tracked.handle.get() });
                    },
                    dispose: tracked.dispose,
                });
            },
            bundledGridAtlas(imagePath: string, layout: { columns: number; rows: number; frameDurationMs?: number }) {
                assertActive();
                const tracked = trackVisualHandle(new BundledGridAtlasHandle(imagePath, layout, loadScopedAsset));
                return Object.freeze({
                    get: () => {
                        tracked.assertActive();
                        return Object.freeze({ ...tracked.handle.get() });
                    },
                    dispose: tracked.dispose,
                });
            },
            generatedRaster(request: {
                contentKey: string;
                width: number;
                height: number;
                format: 'rgba8';
                build: () => Uint8ClampedArray;
            }) {
                if (controller.signal.aborted)
                    return err(diagnostic('ABORTED', 'Raster generation was aborted', 'assets.generatedRaster'));
                try {
                    const generated = renderResourceManager.generatedRaster({
                        namespace: `plugin:${options.pluginId}:sdk-v2`,
                        ...request,
                    });
                    return ok(
                        Object.freeze({
                            resource: generated.resource,
                            status: 'ready' as const,
                        })
                    );
                } catch (error) {
                    return err(
                        diagnostic(
                            'INVALID_ARGUMENT',
                            error instanceof Error ? error.message : String(error),
                            'assets.generatedRaster'
                        )
                    );
                }
            },
        }),
    };

    async function loadScopedAsset(path: string): Promise<string> {
        const result = await context.assets.load(path);
        if (!result.ok) throw new Error(result.error.message);
        return result.value.url;
    }

    if (host && granted(PLUGIN_CAPABILITIES.timelineRead)) {
        (context as any).timeline = Object.freeze({
            getMetadata() {
                const snapshot = host.timeline.getStateSnapshot();
                if (!snapshot)
                    return err(diagnostic('RESOURCE_UNAVAILABLE', 'Timeline is unavailable', 'timeline.getMetadata'));
                const durationSeconds = host.timeline.getTimelineDuration();
                const signature = host.timing.getTimeSignature() ?? { numerator: 4, denominator: 4 };
                return ok(
                    Object.freeze({
                        durationSeconds,
                        playbackStartSeconds: 0,
                        playbackEndSeconds: durationSeconds,
                        tempoBpm: Number(snapshot.timeline?.globalBpm ?? 120),
                        timeSignature: Object.freeze({ ...signature }),
                    })
                );
            },
            getTrack(trackId: string) {
                if (!trackId) return err(diagnostic('INVALID_ARGUMENT', 'trackId is required', 'timeline.getTrack'));
                const track = host.timeline.getTrackById(trackId);
                return track
                    ? ok(trackSummary(track))
                    : err(diagnostic('NOT_FOUND', `Track '${trackId}' was not found`, 'timeline.getTrack'));
            },
            getTracks(trackIds?: readonly string[]) {
                const tracks = trackIds ? host.timeline.getTracksByIds([...trackIds]) : host.timeline.getMidiTracks();
                return ok(Object.freeze(tracks.map(trackSummary)));
            },
            selectNotes(args: { trackIds?: readonly string[]; startSeconds: number; endSeconds: number }) {
                const valid = finiteRange(args.startSeconds, args.endSeconds, 'timeline.selectNotes');
                if (!valid.ok) return valid;
                const trackIds = args.trackIds
                    ? [...args.trackIds]
                    : host.timeline.getMidiTracks().map((track) => track.id);
                const notes = host.timeline.selectNotesInWindow({
                    trackIds,
                    startSec: args.startSeconds,
                    endSec: args.endSeconds,
                });
                return ok(
                    frozenArray(
                        notes.map((note) => ({
                            trackId: note.trackId,
                            channel: note.channel,
                            note: note.note,
                            velocity: note.velocity,
                            startSeconds: note.startTime,
                            endSeconds: note.endTime,
                            durationSeconds: note.duration,
                            clipId: note.clipId,
                            sourceId: note.sourceId,
                        }))
                    )
                );
            },
            selectCC(args: {
                trackIds?: readonly string[];
                controller?: number;
                startSeconds: number;
                endSeconds: number;
            }) {
                const valid = finiteRange(args.startSeconds, args.endSeconds, 'timeline.selectCC');
                if (!valid.ok) return valid;
                const events = host.timeline.selectCCInWindow({
                    trackIds: args.trackIds ? [...args.trackIds] : undefined,
                    controller: args.controller,
                    startSec: args.startSeconds,
                    endSec: args.endSeconds,
                });
                return ok(frozenArray(events.map((event) => ({ ...event, timeSeconds: event.timeSec }))));
            },
            getSustain(args: { trackIds?: readonly string[]; timeSeconds: number }) {
                if (!Number.isFinite(args.timeSeconds))
                    return err(diagnostic('INVALID_ARGUMENT', 'timeSeconds must be finite', 'timeline.getSustain'));
                return ok(
                    host.timeline.getSustainStateAtTime({
                        trackIds: args.trackIds ? [...args.trackIds] : undefined,
                        timeSec: args.timeSeconds,
                    })
                );
            },
        });
    }

    if (host && (granted(PLUGIN_CAPABILITIES.audioFeaturesRead) || granted(PLUGIN_CAPABILITIES.audioRawRead))) {
        (context as any).audio = Object.freeze({
            getChannelMetadata(trackId: string) {
                if (!granted(PLUGIN_CAPABILITIES.audioRawRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioRawRead, 'audio.getChannelMetadata');
                const sampleRate = host.audio.getSampleRate({ trackId });
                if (!sampleRate)
                    return err(
                        diagnostic(
                            'RESOURCE_UNAVAILABLE',
                            `Audio track '${trackId}' is unavailable`,
                            'audio.getChannelMetadata'
                        )
                    );
                return ok(
                    Object.freeze({
                        sampleRate,
                        channelCount: 1,
                        durationSeconds: host.timeline.getTimelineDuration(),
                        channelLabels: Object.freeze(['mono']),
                    })
                );
            },
            sampleFeature(args: { trackId: string; feature: any; timeSeconds: number; smoothing?: number }) {
                if (!granted(PLUGIN_CAPABILITIES.audioFeaturesRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioFeaturesRead, 'audio.sampleFeature');
                if (!Number.isFinite(args.timeSeconds))
                    return err(diagnostic('INVALID_ARGUMENT', 'timeSeconds must be finite', 'audio.sampleFeature'));
                const frame = host.audio.sampleFeatureAtTime({
                    trackId: args.trackId,
                    feature: args.feature,
                    time: args.timeSeconds,
                    samplingOptions: args.smoothing === undefined ? undefined : { smoothing: args.smoothing },
                });
                if (frame == null)
                    return err(
                        diagnostic('RESOURCE_UNAVAILABLE', 'Audio feature is unavailable', 'audio.sampleFeature')
                    );
                const frameMetadata = frame.metadata?.frame as
                    { channelValues?: readonly (readonly number[])[]; sampleRate?: number } | undefined;
                return ok(
                    Object.freeze({
                        timeSeconds: args.timeSeconds,
                        value: Object.freeze([...frame.values]),
                        ...(frameMetadata?.channelValues
                            ? {
                                  channelValues: Object.freeze(
                                      frameMetadata.channelValues.map((channel) => Object.freeze([...channel]))
                                  ),
                              }
                            : {}),
                        ...(typeof frameMetadata?.sampleRate === 'number'
                            ? { sampleRate: frameMetadata.sampleRate }
                            : {}),
                    })
                );
            },
            sampleFeatureRange(args: {
                trackId: string;
                feature: any;
                startSeconds: number;
                endSeconds: number;
                stepSeconds: number;
            }) {
                if (!granted(PLUGIN_CAPABILITIES.audioFeaturesRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioFeaturesRead, 'audio.sampleFeatureRange');
                const valid = finiteRange(args.startSeconds, args.endSeconds, 'audio.sampleFeatureRange');
                if (!valid.ok) return valid;
                if (!Number.isFinite(args.stepSeconds) || args.stepSeconds <= 0)
                    return err(
                        diagnostic(
                            'INVALID_ARGUMENT',
                            'stepSeconds must be positive and finite',
                            'audio.sampleFeatureRange'
                        )
                    );
                const frames = host.audio.sampleFeatureRange({
                    trackId: args.trackId,
                    feature: args.feature,
                    startTime: args.startSeconds,
                    endTime: args.endSeconds,
                    stepSec: args.stepSeconds,
                });
                return ok(
                    Object.freeze(
                        frames.map((frame) => {
                            const metadata = frame.result.metadata?.frame as
                                { channelValues?: readonly (readonly number[])[]; sampleRate?: number } | undefined;
                            return Object.freeze({
                                timeSeconds: frame.time,
                                value: Object.freeze([...frame.result.values]),
                                ...(metadata?.channelValues
                                    ? {
                                          channelValues: Object.freeze(
                                              metadata.channelValues.map((channel) => Object.freeze([...channel]))
                                          ),
                                      }
                                    : {}),
                                ...(typeof metadata?.sampleRate === 'number'
                                    ? { sampleRate: metadata.sampleRate }
                                    : {}),
                            });
                        })
                    )
                );
            },
            sampleFeatureMatrix(args: {
                trackId: string;
                feature: string | { key: string; channel?: string | number };
                startSeconds: number;
                stepSeconds: number;
                frameCount: number;
                interpolation?: 'linear' | 'nearest';
            }) {
                if (!granted(PLUGIN_CAPABILITIES.audioFeaturesRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioFeaturesRead, 'audio.sampleFeatureMatrix');
                if (
                    !Number.isFinite(args.startSeconds) ||
                    !Number.isFinite(args.stepSeconds) ||
                    args.stepSeconds <= 0 ||
                    !Number.isInteger(args.frameCount) ||
                    args.frameCount <= 0
                ) {
                    return err(
                        diagnostic(
                            'INVALID_ARGUMENT',
                            'Matrix range and frameCount are invalid',
                            'audio.sampleFeatureMatrix'
                        )
                    );
                }
                const featureKey = typeof args.feature === 'string' ? args.feature : args.feature?.key;
                if (!featureKey)
                    return err(diagnostic('INVALID_ARGUMENT', 'Feature key is required', 'audio.sampleFeatureMatrix'));
                let matrix;
                try {
                    matrix = host.audio.sampleFeatureMatrix({
                        trackId: args.trackId,
                        featureKey,
                        startSeconds: args.startSeconds,
                        stepSeconds: args.stepSeconds,
                        frameCount: args.frameCount,
                        interpolation: args.interpolation,
                    });
                } catch (error) {
                    return err(
                        diagnostic(
                            'INVALID_ARGUMENT',
                            error instanceof Error ? error.message : String(error),
                            'audio.sampleFeatureMatrix'
                        )
                    );
                }
                return matrix
                    ? ok(
                          Object.freeze({
                              ...matrix,
                              data: matrix.data.slice(),
                              coverage: matrix.coverage.slice(),
                          })
                      )
                    : err(
                          diagnostic(
                              'RESOURCE_UNAVAILABLE',
                              'Audio feature matrix is unavailable',
                              'audio.sampleFeatureMatrix'
                          )
                      );
            },
            getRawSamples(args: { trackId: string; startSeconds: number; endSeconds: number; channel?: any }) {
                if (!granted(PLUGIN_CAPABILITIES.audioRawRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioRawRead, 'audio.getRawSamples');
                const valid = finiteRange(args.startSeconds, args.endSeconds, 'audio.getRawSamples');
                if (!valid.ok || args.endSeconds === args.startSeconds)
                    return valid.ok
                        ? err(diagnostic('INVALID_ARGUMENT', 'Raw PCM range must be non-empty', 'audio.getRawSamples'))
                        : valid;
                if (controller.signal.aborted)
                    return err(diagnostic('ABORTED', 'Raw PCM read was aborted', 'audio.getRawSamples'));
                const samples = host.audio.getRawSamples({
                    trackId: args.trackId,
                    startSec: args.startSeconds,
                    endSec: args.endSeconds,
                    channel: args.channel,
                    signal: controller.signal,
                });
                if (controller.signal.aborted)
                    return err(diagnostic('ABORTED', 'Raw PCM read was aborted', 'audio.getRawSamples'));
                return samples
                    ? ok(samples.slice())
                    : err(diagnostic('RESOURCE_UNAVAILABLE', 'Raw PCM is unavailable', 'audio.getRawSamples'));
            },
            getRms(args: { trackId: string; startSeconds: number; endSeconds: number }) {
                if (!granted(PLUGIN_CAPABILITIES.audioRawRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioRawRead, 'audio.getRms');
                const valid = finiteRange(args.startSeconds, args.endSeconds, 'audio.getRms');
                if (!valid.ok) return valid;
                const value = host.audio.getRmsInWindow({
                    trackId: args.trackId,
                    startSec: args.startSeconds,
                    endSec: args.endSeconds,
                });
                return value
                    ? ok(value.slice())
                    : err(diagnostic('RESOURCE_UNAVAILABLE', 'Audio RMS is unavailable', 'audio.getRms'));
            },
        });
    }

    if (host && granted(PLUGIN_CAPABILITIES.timingConversion)) {
        const conversion = (operation: string, value: number, fn: (value: number) => number | null): Result<number> => {
            if (!Number.isFinite(value))
                return err(diagnostic('INVALID_ARGUMENT', 'Timing value must be finite', operation));
            const result = fn(value);
            return result == null
                ? err(diagnostic('RESOURCE_UNAVAILABLE', 'Timing data is unavailable', operation))
                : ok(result);
        };
        (context as any).timing = Object.freeze({
            secondsToTicks: (v: number) => conversion('timing.secondsToTicks', v, host.timing.secondsToTicks),
            ticksToSeconds: (v: number) => conversion('timing.ticksToSeconds', v, host.timing.ticksToSeconds),
            secondsToBeats: (v: number) => conversion('timing.secondsToBeats', v, host.timing.secondsToBeats),
            beatsToSeconds: (v: number) => conversion('timing.beatsToSeconds', v, host.timing.beatsToSeconds),
            beatsToTicks: (v: number) => conversion('timing.beatsToTicks', v, host.timing.beatsToTicks),
            ticksToBeats: (v: number) => conversion('timing.ticksToBeats', v, host.timing.ticksToBeats),
            getTimeSignature: () => {
                const value = host.timing.getTimeSignature();
                return value
                    ? ok(Object.freeze({ ...value }))
                    : err(
                          diagnostic('RESOURCE_UNAVAILABLE', 'Time signature is unavailable', 'timing.getTimeSignature')
                      );
            },
        });
    }

    if (host && granted(PLUGIN_CAPABILITIES.midiUtils))
        (context as any).midi = Object.freeze({ noteName: host.utilities.midiNoteToName });
    if (host && granted(PLUGIN_CAPABILITIES.audioCalculatorsRegister)) {
        (context as any).audioCalculators = Object.freeze({
            register(calculator: any) {
                if (controller.signal.aborted)
                    return err(
                        diagnostic('ABORTED', 'Calculator registration was aborted', 'audioCalculators.register')
                    );
                host.audioCalculators.register(calculator);
                let disposed = false;
                const dispose = () => {
                    if (disposed) return;
                    disposed = true;
                    cleanups.delete(dispose);
                    host.audioCalculators.unregister(calculator.id);
                };
                cleanups.add(dispose);
                return ok(Object.freeze({ dispose }));
            },
        });
    }
    return Object.freeze(context);
}

export function createPluginDefinitionScope(
    definition: PluginElementDefinition<any, any, any, any>,
    options: ScopeOptions
): PluginDefinitionScope {
    const controller = new AbortController();
    const cleanups = new Set<() => void>();
    const context = createContext(definition, controller, options, cleanups);
    const setupContext = resourceContext(context);
    const instances = new Set<V2SceneElement>();
    const fontPropertyKeys = new Set<string>();
    const definitionPropertyKeys = new Set<string>();
    const runtimeSchema =
        definition.schema && typeof definition.schema === 'object'
            ? (definition.schema as EnhancedConfigSchema)
            : undefined;
    for (const tab of runtimeSchema?.tabs ?? []) {
        for (const group of tab.groups ?? []) {
            for (const property of group.properties ?? []) {
                if (property?.key) definitionPropertyKeys.add(property.key);
                if (property?.type === 'font' && property.key) fontPropertyKeys.add(property.key);
            }
        }
    }
    let failure: PluginDiagnostic | undefined;
    let synchronouslyReady = false;
    let ready: Promise<boolean>;
    if (options.synchronousInitialization) {
        try {
            const loaded = definition.load?.(setupContext);
            if (loaded && typeof (loaded as PromiseLike<void>).then === 'function') {
                void Promise.resolve(loaded).catch((error) =>
                    runCleanup(() => {
                        throw error;
                    }, options)
                );
                throw new Error('Built-in definition load() must be synchronous');
            }
            synchronouslyReady = true;
            ready = Promise.resolve(true);
        } catch (error) {
            controller.abort();
            drainCleanups(cleanups, options);
            failure = diagnostic(
                'INITIALIZATION_FAILED',
                error instanceof Error ? error.message : String(error),
                'element.load'
            );
            options.report(failure);
            ready = Promise.resolve(false);
        }
    } else {
        ready = Promise.resolve()
            .then(() => (controller.signal.aborted ? undefined : definition.load?.(setupContext)))
            .then(() => !controller.signal.aborted)
            .catch((error) => {
                controller.abort();
                drainCleanups(cleanups, options);
                failure = diagnostic(
                    'INITIALIZATION_FAILED',
                    error instanceof Error ? error.message : String(error),
                    'element.load'
                );
                options.report(failure);
                return false;
            });
    }

    class V2SceneElement extends BoundSceneElement {
        readonly hasSimulation = !!definition.simulation;
        private readonly previewSession = {};
        private readonly simulations = new Map<
            object,
            {
                runner: SimulationRunner;
                generation: SimulationGeneration;
                config: string;
                inputs: SimulationInputs;
                context: ElementContext<any>;
            }
        >();
        private activeSimulation?: SimulationRunner;
        private simulationRenderContext?: ElementContext<any>;
        private simulationPropsAt?: SimulationInputs['propsAt'];
        private readonly simulationDemandOwner = { id: `simulation:${this.id}` };
        private readonly simulationDemands = new Map<string, any>();
        private asyncInitialization?: Promise<void>;
        private initializationError?: Error;
        private readonly simulationCreatedAt = runtimeNow();
        private simulationChangedCallback?: () => void;
        private lastReadySimulationOutput?: RenderObject[];
        private notReadySince?: number;
        private placeholderVisibleSince?: number;
        private placeholderReadiness?: SimulationReadiness;
        private simulationTransitionTimer?: ReturnType<typeof setTimeout>;

        getSimulationStatus(session = this.previewSession) {
            return this.getSimulationReadiness(session).status;
        }

        getSimulationReadiness(session = this.previewSession): SimulationReadiness {
            const runner = this.simulations.get(session)?.runner;
            if (runner) return runner.getReadiness();
            const status: SimulationStatus = this.initializationFailed
                ? 'error'
                : this.instanceController.signal.aborted
                  ? 'disposed'
                  : this.initialized
                    ? 'idle'
                    : 'preparing';
            const reason =
                status === 'error'
                    ? this.initializationError?.message || 'Simulation initialization failed'
                    : status === 'disposed'
                      ? 'Simulation was disposed'
                      : status === 'idle'
                        ? 'Waiting to prepare simulation'
                        : 'Initializing simulation resources';
            return Object.freeze({
                status,
                reason,
                completedStep: -1,
                targetStep: 0,
                changedAt: this.simulationCreatedAt,
            });
        }

        requestSimulationFrame(
            seconds: number,
            generation: SimulationGeneration,
            changed: () => void,
            session = this.previewSession
        ) {
            if (!definition.simulation || this.instanceController.signal.aborted) return 'disposed' as const;
            this.simulationChangedCallback = changed;
            if (!this.initialized) return this.initializationFailed ? ('error' as const) : ('preparing' as const);
            const config = this.getSerializableConfig();
            const signature = JSON.stringify(config);
            let record = this.simulations.get(session);
            if (!record || record.generation !== generation || record.config !== signature) {
                const properties = generation.properties(config, [...definitionPropertyKeys]);
                const context = createContext(
                    definition,
                    this.instanceController,
                    { ...options, services: generation.services },
                    this.instanceCleanups,
                    properties.api
                );
                const inputs = generation.inputs(context, properties.propsAt, (props) => {
                    const demands = definition.audioFeatureDemands?.(props) ?? [];
                    for (const demand of demands) {
                        const key = JSON.stringify(demand);
                        if (!this.simulationDemands.has(key))
                            this.simulationDemands.set(key, {
                                ...demand,
                                id: `${demand.id}:history:${this.simulationDemands.size}`,
                            });
                    }
                    syncDeclarativeAudioFeatureDemands(this.simulationDemandOwner, [
                        ...this.simulationDemands.values(),
                    ]);
                    return demands;
                });
                const runner =
                    record?.runner ??
                    new SimulationRunner(definition.simulation, () => {
                        if (runner.status === 'error')
                            options.report(
                                diagnostic(
                                    'CONTRACT_VIOLATION',
                                    runner.error?.message ?? 'Simulation failed',
                                    'element.simulation'
                                )
                            );
                        changed();
                    });
                record = { runner, inputs, generation, config: signature, context };
                this.simulations.set(session, record);
            }
            this.activeSimulation = record.runner;
            this.simulationRenderContext = record.context;
            this.simulationPropsAt = record.inputs.propsAt;
            record.runner.request(seconds, record.inputs);
            return record.runner.status;
        }

        async prepareSimulationFrame(
            seconds: number,
            generation: SimulationGeneration,
            changed: () => void,
            signal?: AbortSignal,
            session = this.previewSession
        ): Promise<void> {
            signal = AbortSignal.any([this.instanceController.signal, ...(signal ? [signal] : [])]);
            if (signal?.aborted) throw new DOMException('Simulation cancelled', 'AbortError');
            if (this.asyncInitialization)
                await new Promise<void>((resolve, reject) => {
                    const abort = () => {
                        cleanup();
                        reject(new DOMException('Simulation cancelled', 'AbortError'));
                    };
                    const cleanup = () => signal?.removeEventListener('abort', abort);
                    signal?.addEventListener('abort', abort, { once: true });
                    this.asyncInitialization!.then(
                        () => {
                            cleanup();
                            resolve();
                        },
                        (error) => {
                            cleanup();
                            reject(error);
                        }
                    );
                    if (signal?.aborted) abort();
                });
            if (this.initializationFailed || this.instanceController.signal.aborted)
                throw new Error('Simulation instance initialization failed or was disposed');
            this.requestSimulationFrame(seconds, generation, changed, session);
            const record = this.simulations.get(session);
            if (record) await record.runner.prepare(seconds, record.inputs, signal);
        }

        releaseSimulationSession(session: object): void {
            this.simulations.get(session)?.runner.dispose();
            this.simulations.delete(session);
        }
        private readonly instanceController = new AbortController();
        private readonly instanceCleanups = new Set<() => void>();
        private readonly instanceContext = createContext(
            definition,
            this.instanceController,
            options,
            this.instanceCleanups,
            this.createPropertyApi()
        );
        private readonly setupContext = resourceContext(this.instanceContext);
        private resources: any = undefined;
        private initialized = false;
        private initializationFailed = false;
        private readonly requestedFonts = new Map<string, string>();
        private demandSyncEnabled = false;

        private failInitialization(error: unknown): void {
            this.initializationFailed = true;
            this.initializationError = error instanceof Error ? error : new Error(String(error));
            this.instanceController.abort();
            clearDeclarativeAudioFeatureDemands(this);
            drainCleanups(this.instanceCleanups, options);
            options.report(diagnostic('INITIALIZATION_FAILED', String(error), 'element.createResources'));
        }

        private acceptResources(resources: unknown): void {
            if (this.instanceController.signal.aborted) {
                runCleanup(() => definition.disposeResources?.(resources, this.setupContext), options);
                return;
            }
            this.resources = resources;
            this.initialized = true;
        }

        private syncDefinitionAudioDemands(): void {
            if (!this.demandSyncEnabled || !definition.audioFeatureDemands) return;
            const hasFeatureGrant =
                [...(options.capabilities?.required ?? []), ...(options.capabilities?.optional ?? [])].includes(
                    PLUGIN_CAPABILITIES.audioFeaturesRead
                ) && !!options.services?.capabilities.includes(PLUGIN_CAPABILITIES.audioFeaturesRead);
            if (!hasFeatureGrant) {
                clearDeclarativeAudioFeatureDemands(this);
                return;
            }
            try {
                const demands = definition.audioFeatureDemands(this.getDefinitionProps());
                syncDeclarativeAudioFeatureDemands(this, Array.isArray(demands) ? demands : []);
            } catch (error) {
                clearDeclarativeAudioFeatureDemands(this);
                options.report(
                    diagnostic(
                        'INVALID_ARGUMENT',
                        error instanceof Error ? error.message : String(error),
                        'element.audioFeatureDemands'
                    )
                );
            }
        }

        private createPropertyApi(): ElementPropertyApi<Readonly<Record<string, unknown>>> {
            const valueAt = (key: string, timeSeconds: number): Result<unknown> => {
                if (this.instanceController.signal.aborted)
                    return err(diagnostic('ABORTED', 'Element instance has been disposed', 'properties.valueAt'));
                if (!definitionPropertyKeys.has(key))
                    return err(
                        diagnostic(
                            'INVALID_ARGUMENT',
                            `Property '${key}' is not declared by this element`,
                            'properties.valueAt'
                        )
                    );
                if (!Number.isFinite(timeSeconds))
                    return err(diagnostic('INVALID_ARGUMENT', 'timeSeconds must be finite', 'properties.valueAt'));
                try {
                    const value = this.getPropertyAtTime(key, timeSeconds);
                    return value === undefined
                        ? err(
                              diagnostic(
                                  'RESOURCE_UNAVAILABLE',
                                  `Property '${key}' could not be resolved at ${timeSeconds} seconds`,
                                  'properties.valueAt'
                              )
                          )
                        : ok(value);
                } catch (error) {
                    return err(
                        diagnostic(
                            'RESOURCE_UNAVAILABLE',
                            error instanceof Error ? error.message : String(error),
                            'properties.valueAt'
                        )
                    );
                }
            };
            const integrate = (
                key: string,
                range: PropertyTimeRange,
                integrationOptions?: PropertyIntegrationOptions
            ): Result<number> => {
                const valid = finiteRange(range?.startSeconds, range?.endSeconds, 'properties.integrate');
                if (!valid.ok) return valid;
                let sampleFailure: PluginDiagnostic | undefined;
                const result = integratePropertySampler(
                    (timeSeconds) => {
                        const sampled = valueAt(key, timeSeconds);
                        if (!sampled.ok) {
                            sampleFailure = sampled.error;
                            return { ok: false, message: sampled.error.message };
                        }
                        if (typeof sampled.value !== 'number' || !Number.isFinite(sampled.value)) {
                            sampleFailure = diagnostic(
                                'INVALID_ARGUMENT',
                                `Property '${key}' must resolve to finite numeric values for integration`,
                                'properties.integrate'
                            );
                            return { ok: false, message: sampleFailure.message };
                        }
                        return { ok: true, value: sampled.value };
                    },
                    range.startSeconds,
                    range.endSeconds,
                    integrationOptions
                );
                if (result.ok) return ok(result.value);
                if (sampleFailure) return err(sampleFailure);
                return err(
                    diagnostic(
                        result.error.reason === 'invalid-options' ? 'INVALID_ARGUMENT' : 'RESOURCE_UNAVAILABLE',
                        result.error.message,
                        'properties.integrate'
                    )
                );
            };
            return Object.freeze({
                valueAt,
                integrate,
                average: (
                    key: string,
                    range: PropertyTimeRange,
                    integrationOptions?: PropertyIntegrationOptions
                ): Result<number> => {
                    const valid = finiteRange(range?.startSeconds, range?.endSeconds, 'properties.average');
                    if (!valid.ok) return valid;
                    const duration = range.endSeconds - range.startSeconds;
                    if (duration === 0)
                        return err(
                            diagnostic(
                                'INVALID_ARGUMENT',
                                'Property average requires a non-empty range',
                                'properties.average'
                            )
                        );
                    const result = integrate(key, range, integrationOptions);
                    return result.ok ? ok(result.value / duration) : result;
                },
            }) as ElementPropertyApi<Readonly<Record<string, unknown>>>;
        }

        private getDefinitionProps(): Readonly<Record<string, unknown>> {
            const schema =
                definition.schema && typeof definition.schema === 'object'
                    ? (definition.schema as EnhancedConfigSchema)
                    : undefined;
            const props: Record<string, unknown> = {};
            for (const tab of schema?.tabs ?? []) {
                for (const group of tab.groups ?? []) {
                    for (const property of group.properties ?? []) {
                        if (property?.key) props[property.key] = this.getProperty(property.key);
                    }
                }
            }
            return Object.freeze(props);
        }

        private requestDefinitionFonts(props: Readonly<Record<string, unknown>>): void {
            for (const key of fontPropertyKeys) {
                const selection = props[key];
                if (typeof selection !== 'string' || !selection || this.requestedFonts.get(key) === selection) continue;
                this.requestedFonts.set(key, selection);
                void ensureFontLoaded(selection).catch((error) => {
                    options.report(
                        diagnostic(
                            'RESOURCE_UNAVAILABLE',
                            error instanceof Error ? error.message : String(error),
                            `font.${key}`
                        )
                    );
                });
            }
        }

        constructor(id: string = definition.type, config: Record<string, unknown> = {}) {
            const definitionSchema =
                definition.schema && typeof definition.schema === 'object'
                    ? (definition.schema as { defaultConfig?: Record<string, unknown> })
                    : undefined;
            super(options.runtimeElementType ?? definition.type, id, {
                ...(definitionSchema?.defaultConfig ?? {}),
                ...config,
            });
            if (controller.signal.aborted) {
                this.instanceController.abort();
                return;
            }
            instances.add(this);
            this.demandSyncEnabled = true;
            this.syncDefinitionAudioDemands();
            this.requestDefinitionFonts(this.getDefinitionProps());
            if (options.synchronousInitialization && synchronouslyReady) {
                try {
                    const created = definition.createResources?.(this.setupContext);
                    if (created && typeof (created as PromiseLike<unknown>).then === 'function') {
                        void Promise.resolve(created).then(
                            (resources) => this.acceptResources(resources),
                            (error) =>
                                runCleanup(() => {
                                    throw error;
                                }, options)
                        );
                        throw new Error('Built-in definition createResources() must be synchronous');
                    }
                    this.acceptResources(created);
                } catch (error) {
                    this.failInitialization(error);
                }
                return;
            }
            this.asyncInitialization = ready.then(async (scopeReady) => {
                if (this.instanceController.signal.aborted) return;
                if (!scopeReady) {
                    this.failInitialization('Definition initialization failed');
                    return;
                }
                try {
                    const resources = await definition.createResources?.(this.setupContext);
                    this.acceptResources(resources);
                    if (this.hasSimulation && typeof window !== 'undefined')
                        window.dispatchEvent(new CustomEvent('mvmnt-scene-runtime-updated'));
                } catch (error) {
                    this.failInitialization(error);
                }
            });
        }

        static override getConfigSchema(): EnhancedConfigSchema {
            const schema =
                definition.schema && typeof definition.schema === 'object'
                    ? (definition.schema as Partial<EnhancedConfigSchema>)
                    : {};
            const merged = insertElementConfig(
                BoundSceneElement.getConfigSchema(),
                {
                    name: definition.metadata.name,
                    description: definition.metadata.description ?? '',
                    category: definition.metadata.category ?? 'Plugins',
                },
                schema.tabs ?? []
            );
            return { ...merged, ...(schema.presets ? { presets: schema.presets } : {}) };
        }

        private scheduleSimulationTransition(delay: number): void {
            if (this.simulationTransitionTimer !== undefined) return;
            this.simulationTransitionTimer = setTimeout(
                () => {
                    this.simulationTransitionTimer = undefined;
                    this.simulationChangedCallback?.();
                },
                Math.max(0, delay)
            );
        }

        private currentSimulationProps(targetTime: number): Readonly<Record<string, unknown>> {
            try {
                return this.simulationPropsAt?.(targetTime) ?? this.getDefinitionProps();
            } catch {
                return this.getDefinitionProps();
            }
        }

        private renderSimulationPlaceholder(readiness: SimulationReadiness, targetTime: number): RenderObject[] {
            this.placeholderVisibleSince ??= runtimeNow();
            this.placeholderReadiness = readiness;
            return simulationPlaceholder(
                readiness,
                this.currentSimulationProps(targetTime),
                this.lastReadySimulationOutput
            );
        }

        protected override _buildRenderObjects(_config: any, targetTime: number): RenderObject[] {
            if (this.instanceController.signal.aborted && !this.initializationFailed) return [];
            if (this.hasSimulation && (!this.initialized || this.initializationFailed)) {
                return this.renderSimulationPlaceholder(this.getSimulationReadiness(), targetTime);
            }
            if (!this.initialized) return [];
            const simulation = this.activeSimulation?.snapshot(targetTime);
            if (this.hasSimulation && !simulation) {
                const readiness = this.getSimulationReadiness();
                const now = runtimeNow();
                this.notReadySince ??= now;
                if (
                    readiness.status === 'preparing' &&
                    this.lastReadySimulationOutput !== undefined &&
                    now - this.notReadySince < SIMULATION_PLACEHOLDER_GRACE_MS
                ) {
                    this.scheduleSimulationTransition(SIMULATION_PLACEHOLDER_GRACE_MS - (now - this.notReadySince));
                    return this.lastReadySimulationOutput;
                }
                return this.renderSimulationPlaceholder(readiness, targetTime);
            }
            if (this.hasSimulation && this.placeholderVisibleSince !== undefined) {
                const elapsed = runtimeNow() - this.placeholderVisibleSince;
                if (elapsed < SIMULATION_PLACEHOLDER_GRACE_MS) {
                    this.scheduleSimulationTransition(SIMULATION_PLACEHOLDER_GRACE_MS - elapsed);
                    return simulationPlaceholder(
                        this.placeholderReadiness ?? this.getSimulationReadiness(),
                        this.currentSimulationProps(targetTime),
                        this.lastReadySimulationOutput
                    );
                }
            }
            this.notReadySince = undefined;
            this.placeholderVisibleSince = undefined;
            this.placeholderReadiness = undefined;
            if (this.simulationTransitionTimer !== undefined) clearTimeout(this.simulationTransitionTimer);
            this.simulationTransitionTimer = undefined;
            const props =
                this.hasSimulation && this.simulationPropsAt
                    ? this.simulationPropsAt(targetTime)
                    : this.getDefinitionProps();
            this.requestDefinitionFonts(props);
            const context = this.hasSimulation ? this.simulationRenderContext! : this.instanceContext;
            const beats = context.timing?.secondsToBeats(targetTime);
            const ticks = context.timing?.secondsToTicks(targetTime);
            const time = Object.freeze({
                seconds: targetTime,
                beats: beats?.ok ? beats.value : null,
                ticks: ticks?.ok ? ticks.value : null,
                frame: null,
                ...(_config?.canvas
                    ? { viewport: Object.freeze({ width: _config.canvas.width, height: _config.canvas.height }) }
                    : {}),
                ...(Number.isFinite(_config?.duration) ? { durationSeconds: _config.duration } : {}),
                ...(Number.isFinite(_config?.playRangeStartSec)
                    ? { playbackStartSeconds: _config.playRangeStartSec }
                    : {}),
                ...(Number.isFinite(_config?.playRangeEndSec) ? { playbackEndSeconds: _config.playRangeEndSec } : {}),
            });
            const output = [
                ...definition.render(Object.freeze({ props, resources: this.resources, time, context, simulation })),
            ] as RenderObject[];
            if (this.hasSimulation) this.lastReadySimulationOutput = output;
            return output;
        }

        protected override onPropertyChanged(key: string, oldValue: unknown, newValue: unknown): void {
            super.onPropertyChanged(key, oldValue, newValue);
            if (oldValue !== newValue) this.syncDefinitionAudioDemands();
        }

        protected override onPropertyBindingsInvalidated(): void {
            super.onPropertyBindingsInvalidated();
            this.syncDefinitionAudioDemands();
        }

        protected override onDestroy(): void {
            if (this.simulationTransitionTimer !== undefined) clearTimeout(this.simulationTransitionTimer);
            this.simulationTransitionTimer = undefined;
            this.simulationChangedCallback = undefined;
            this.lastReadySimulationOutput = undefined;
            for (const { runner } of this.simulations.values()) runner.dispose();
            this.simulations.clear();
            this.activeSimulation = undefined;
            clearDeclarativeAudioFeatureDemands(this.simulationDemandOwner);
            this.simulationDemands.clear();
            instances.delete(this);
            clearDeclarativeAudioFeatureDemands(this);
            this.instanceController.abort();
            if (this.initialized) {
                this.initialized = false;
                runCleanup(() => definition.disposeResources?.(this.resources, this.setupContext), options);
                this.resources = undefined;
            }
            drainCleanups(this.instanceCleanups, options);
            super.onDestroy();
        }
    }

    const createRegistration = (origin: SceneElementOrigin, overrideCategory?: string): SceneElementRegistration => {
        const schema = publicSchema(V2SceneElement.getConfigSchema());
        return {
            type: options.runtimeElementType ?? definition.type,
            origin,
            schema: overrideCategory ? { ...schema, category: overrideCategory } : schema,
            create(config = {}) {
                return new V2SceneElement(String(config.id ?? definition.type), config);
            },
        };
    };

    let disposed = false;
    return {
        definition,
        ready,
        get failure() {
            return failure;
        },
        createRegistration,
        async dispose() {
            if (disposed) return;
            disposed = true;
            controller.abort();
            for (const instance of [...instances]) runCleanup(() => instance.dispose(), options);
            try {
                await definition.unload?.(setupContext);
            } catch (error) {
                runCleanup(() => {
                    throw error;
                }, options);
            } finally {
                drainCleanups(cleanups, options);
            }
        },
    };
}
