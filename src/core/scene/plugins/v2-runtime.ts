import { SceneElement } from '@core/scene/elements/base';
import type { EnhancedConfigSchema } from '@core/types';
import { insertElementConfig } from '@core/scene/plugins/plugin-sdk-prop-factories';
import type { RenderObject } from '@core/render/render-objects';
import { BundledGridAtlasHandle, BundledSparrowHandle, BundledSprite } from '@core/resources/bundled-sprite';
import { VisualResourceHandle } from '@core/resources/visual-resource-handle';
import { resolveProjectAssetDescriptor } from '@state/visualAssetRegistryStore';
import {
    PLUGIN_CAPABILITIES,
    type PluginHostServices,
    type PluginHostCapability,
} from './host-api/plugin-api';
import type { CapabilityContext, PluginElementDefinition } from '../../../../packages/plugin-sdk/src/scene';
import { err, ok, type PluginDiagnostic, type Result } from '../../../../packages/plugin-sdk/src/api';
import { registerScopedFeatureRequirements } from '@audio/audioElementMetadata';
import { ensureFontLoaded } from '@fonts/font-loader';
import { renderResourceManager } from '@core/render/render-resource-manager';

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
    loadAsset(path: string): Promise<string>;
    report(diagnostic: PluginDiagnostic): void;
    synchronousInitialization?: boolean;
}

export interface PluginDefinitionScope {
    readonly definition: PluginElementDefinition<any, any>;
    readonly ready: Promise<boolean>;
    readonly failure?: PluginDiagnostic;
    createElementClass(): any;
    dispose(): Promise<void>;
}

function createContext(
    definition: PluginElementDefinition<any, any>,
    controller: AbortController,
    options: ScopeOptions,
    cleanups: Set<() => void>
): CapabilityContext {
    const host = options.services;
    const declared = new Set([
        ...(definition.capabilities.required ?? []),
        ...(definition.capabilities.optional ?? []),
    ]);
    const available = new Set(host?.capabilities ?? []);
    const granted = (capability: PluginHostCapability) => declared.has(capability) && available.has(capability);
    const unavailable = <T>(capability: PluginHostCapability, operation: string): Result<T> =>
        err(diagnostic('CAPABILITY_UNAVAILABLE', `Capability '${capability}' is unavailable`, operation, capability));
    const trackVisualHandle = <T extends { destroy(): void }>(handle: T) => {
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            handle.destroy();
            cleanups.delete(dispose);
        };
        cleanups.add(dispose);
        return { handle, dispose };
    };

    const context: CapabilityContext = {
        signal: controller.signal,
        diagnostics: Object.freeze({ report: options.report }),
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
                const tracked = trackVisualHandle(new VisualResourceHandle());
                return Object.freeze({
                    update(assetId: string | null) {
                        return Object.freeze({ ...tracked.handle.update(resolveProjectAssetDescriptor(assetId)) });
                    },
                    dispose: tracked.dispose,
                });
            },
            bundledImage(path: string) {
                const tracked = trackVisualHandle(new BundledSprite(path, options.loadAsset));
                return Object.freeze({
                    get: () => Object.freeze({ ...tracked.handle.get() }),
                    dispose: tracked.dispose,
                });
            },
            bundledSparrow(imagePath: string, xmlPath: string, defaultFps?: number) {
                const tracked = trackVisualHandle(
                    new BundledSparrowHandle(imagePath, xmlPath, options.loadAsset, undefined, defaultFps)
                );
                return Object.freeze({
                    get: () => Object.freeze({ ...tracked.handle.get() }),
                    dispose: tracked.dispose,
                });
            },
            bundledGridAtlas(imagePath: string, layout: { columns: number; rows: number; frameDurationMs?: number }) {
                const tracked = trackVisualHandle(new BundledGridAtlasHandle(imagePath, layout, options.loadAsset));
                return Object.freeze({
                    get: () => Object.freeze({ ...tracked.handle.get() }),
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
            requireFeatures(requirements: readonly any[]) {
                if (!granted(PLUGIN_CAPABILITIES.audioFeaturesRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioFeaturesRead, 'audio.requireFeatures');
                if (
                    !Array.isArray(requirements) ||
                    requirements.some((requirement) => !requirement || typeof requirement.feature !== 'string')
                ) {
                    return err(
                        diagnostic(
                            'INVALID_ARGUMENT',
                            'Feature requirements must contain a feature key',
                            'audio.requireFeatures'
                        )
                    );
                }
                const unregister = registerScopedFeatureRequirements(
                    options.runtimeElementType ?? definition.type,
                    requirements
                );
                let disposed = false;
                const dispose = () => {
                    if (disposed) return;
                    disposed = true;
                    unregister();
                    cleanups.delete(dispose);
                };
                cleanups.add(dispose);
                return ok(Object.freeze({ dispose }));
            },
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
            sampleFeature(args: { trackId: string; feature: any; timeSeconds: number }) {
                if (!granted(PLUGIN_CAPABILITIES.audioFeaturesRead))
                    return unavailable(PLUGIN_CAPABILITIES.audioFeaturesRead, 'audio.sampleFeature');
                if (!Number.isFinite(args.timeSeconds))
                    return err(diagnostic('INVALID_ARGUMENT', 'timeSeconds must be finite', 'audio.sampleFeature'));
                const frame = host.audio.sampleFeatureAtTime({
                    trackId: args.trackId,
                    feature: args.feature,
                    time: args.timeSeconds,
                });
                if (frame == null)
                    return err(diagnostic('RESOURCE_UNAVAILABLE', 'Audio feature is unavailable', 'audio.sampleFeature'));
                const frameMetadata = frame.metadata?.frame as
                    | { channelValues?: readonly (readonly number[])[]; sampleRate?: number }
                    | undefined;
                return ok(
                    Object.freeze({
                        timeSeconds: args.timeSeconds,
                        value: Object.freeze([...frame.values]),
                        ...(frameMetadata?.channelValues
                            ? { channelValues: Object.freeze(frameMetadata.channelValues.map((channel) => Object.freeze([...channel]))) }
                            : {}),
                        ...(typeof frameMetadata?.sampleRate === 'number' ? { sampleRate: frameMetadata.sampleRate } : {}),
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
                                | { channelValues?: readonly (readonly number[])[]; sampleRate?: number }
                                | undefined;
                            return Object.freeze({
                                timeSeconds: frame.time,
                                value: Object.freeze([...frame.result.values]),
                                ...(metadata?.channelValues
                                    ? { channelValues: Object.freeze(metadata.channelValues.map((channel) => Object.freeze([...channel]))) }
                                    : {}),
                                ...(typeof metadata?.sampleRate === 'number' ? { sampleRate: metadata.sampleRate } : {}),
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
                        diagnostic('INVALID_ARGUMENT', 'Matrix range and frameCount are invalid', 'audio.sampleFeatureMatrix')
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
                host.audioCalculators.register(calculator);
                let disposed = false;
                const dispose = () => {
                    if (disposed) return;
                    disposed = true;
                    host.audioCalculators.unregister(calculator.id);
                    cleanups.delete(dispose);
                };
                cleanups.add(dispose);
                return ok(Object.freeze({ dispose }));
            },
        });
    }
    return Object.freeze(context);
}

export function createPluginDefinitionScope(
    definition: PluginElementDefinition<any, any>,
    options: ScopeOptions
): PluginDefinitionScope {
    const controller = new AbortController();
    const cleanups = new Set<() => void>();
    const context = createContext(definition, controller, options, cleanups);
    const fontPropertyKeys = new Set<string>();
    const runtimeSchema =
        definition.schema && typeof definition.schema === 'object'
            ? (definition.schema as EnhancedConfigSchema)
            : undefined;
    for (const tab of runtimeSchema?.tabs ?? []) {
        for (const group of tab.groups ?? []) {
            for (const property of group.properties ?? []) {
                if (property?.type === 'font' && property.key) fontPropertyKeys.add(property.key);
            }
        }
    }
    let failure: PluginDiagnostic | undefined;
    let synchronouslyReady = false;
    let ready: Promise<boolean>;
    if (options.synchronousInitialization) {
        try {
            const loaded = definition.load?.(context);
            if (loaded && typeof (loaded as PromiseLike<void>).then === 'function') {
                throw new Error('Built-in definition load() must be synchronous');
            }
            synchronouslyReady = true;
            ready = Promise.resolve(true);
        } catch (error) {
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
            .then(() => definition.load?.(context))
            .then(() => true)
            .catch((error) => {
                failure = diagnostic(
                    'INITIALIZATION_FAILED',
                    error instanceof Error ? error.message : String(error),
                    'element.load'
                );
                options.report(failure);
                return false;
            });
    }

    class V2SceneElement extends SceneElement {
        private readonly instanceController = new AbortController();
        private readonly instanceCleanups = new Set<() => void>();
        private readonly instanceContext = createContext(
            definition,
            this.instanceController,
            options,
            this.instanceCleanups
        );
        private state: any = undefined;
        private initialized = false;
        private initializationFailed = false;
        private readonly requestedFonts = new Map<string, string>();

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
            this.requestDefinitionFonts(this.getDefinitionProps());
            if (options.synchronousInitialization && synchronouslyReady) {
                try {
                    const created = definition.create?.(this.getDefinitionProps(), this.instanceContext);
                    if (created && typeof (created as PromiseLike<unknown>).then === 'function') {
                        throw new Error('Built-in definition create() must be synchronous');
                    }
                    this.state = created;
                    this.initialized = true;
                } catch (error) {
                    this.initializationFailed = true;
                    options.report(
                        diagnostic(
                            'INITIALIZATION_FAILED',
                            error instanceof Error ? error.message : String(error),
                            'element.create'
                        )
                    );
                }
                return;
            }
            void ready.then(async (scopeReady) => {
                if (!scopeReady || this.instanceController.signal.aborted) return;
                try {
                    const props = this.getDefinitionProps();
                    this.state = await definition.create?.(props, this.instanceContext);
                    this.initialized = !this.instanceController.signal.aborted;
                } catch (error) {
                    this.initializationFailed = true;
                    options.report(
                        diagnostic(
                            'INITIALIZATION_FAILED',
                            error instanceof Error ? error.message : String(error),
                            'element.create'
                        )
                    );
                }
            });
        }

        static override getConfigSchema(): EnhancedConfigSchema {
            const schema =
                definition.schema && typeof definition.schema === 'object'
                    ? (definition.schema as Partial<EnhancedConfigSchema>)
                    : {};
            const merged = insertElementConfig(
                SceneElement.getConfigSchema(),
                {
                    name: definition.metadata.name,
                    description: definition.metadata.description ?? '',
                    category: definition.metadata.category ?? 'Plugins',
                },
                schema.tabs ?? []
            );
            return { ...merged, ...(schema.presets ? { presets: schema.presets } : {}) };
        }

        protected override _buildRenderObjects(_config: any, targetTime: number): RenderObject[] {
            if (!this.initialized || this.initializationFailed || this.instanceController.signal.aborted) return [];
            const props = this.getDefinitionProps();
            this.requestDefinitionFonts(props);
            const beats = this.instanceContext.timing?.secondsToBeats(targetTime);
            const ticks = this.instanceContext.timing?.secondsToTicks(targetTime);
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
            return [...definition.render(props, this.state, time, this.instanceContext)] as RenderObject[];
        }

        protected override onDestroy(): void {
            this.instanceController.abort();
            for (const cleanup of [...this.instanceCleanups]) cleanup();
            void definition.dispose?.(this.state, this.instanceContext);
        }
    }

    return {
        definition,
        ready,
        get failure() {
            return failure;
        },
        createElementClass: () => V2SceneElement,
        async dispose() {
            controller.abort();
            for (const cleanup of [...cleanups]) cleanup();
            await definition.unload?.(context);
        },
    };
}
