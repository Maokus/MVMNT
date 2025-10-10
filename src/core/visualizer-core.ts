/* eslint-disable @typescript-eslint/no-explicit-any */
import { ModularRenderer } from './render/modular-renderer';
import type {
    RendererContract,
    RendererFrameInput,
    RendererInitResult,
    RendererContextType,
    RenderObject,
} from './render/renderer-contract';
import { WebGLRenderer } from './render/webgl/webgl-renderer';
import { guardCanvasAgainst2D, type CanvasGuardHandle } from './render/webgl/canvas-context-guard';
import { attachContextLossHandlers } from './render/webgl/context';
import type { WebGLRenderPrimitive, RendererDiagnostics } from './render/webgl/types';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { SceneElement } from '@core/scene/elements';
import { CANONICAL_PPQ } from './timing/ppq';
import { loadDefaultScene } from './default-scene-loader';
import { dispatchSceneCommand, SceneRuntimeAdapter, useRenderDiagnosticsStore } from '@state/scene';
import { useSceneStore, type SceneRendererType } from '@state/sceneStore';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import type { SnapGuide } from '@core/interaction/snapping';
import { isCanvasRendererAllowed } from '@utils/renderEnvironment';
import { Rectangle } from './render/render-objects/rectangle';
import { Line } from './render/render-objects/line';
import { Arc } from './render/render-objects/arc';

type WebGLRendererContract = RendererContract<WebGLRenderPrimitive | RenderObject> & {
    diagnostics?: RendererDiagnostics | null;
};

interface MIDIVisualizerRendererFactories {
    createCanvasRenderer?: () => RendererContract<RenderObject>;
    createWebGLRenderer?: () => WebGLRendererContract;
}

export interface MIDIVisualizerCoreOptions {
    rendererFactories?: MIDIVisualizerRendererFactories;
    initialRenderer?: SceneRendererType;
    allowCanvasFallback?: boolean;
}

export class MIDIVisualizerCore {
    canvas: HTMLCanvasElement;
    events: any[] = [];
    duration = 0;
    isPlaying = false;
    startTime = 0;
    animationId: number | null = null;
    currentTime = -0.5;
    exportSettings: any = { fullDuration: true };
    debugSettings: any = { showAnchorPoints: false, showDevelopmentOverlay: false };
    modularRenderer: RendererContract<RenderObject> | null = null;
    renderer: RendererContract<WebGLRenderPrimitive | RenderObject> | null = null;
    webglRenderer: WebGLRendererContract | null = null;
    runtimeAdapter: SceneRuntimeAdapter | null = null;
    private readonly _rendererFactories: {
        createCanvasRenderer: () => RendererContract<RenderObject>;
        createWebGLRenderer: () => WebGLRendererContract;
    };
    private readonly _allowCanvasFallback: boolean;
    private _rendererPreference: SceneRendererType = 'webgl';
    private _rendererContext: RendererContextType = 'webgl';
    private _canvas2dContext: CanvasRenderingContext2D | null = null;
    private _webglContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    private _contextLossUnsubscribe?: () => void;
    private _devicePixelRatio = 1;
    private _viewportWidth = 0;
    private _viewportHeight = 0;
    private _settingsUnsubscribe?: () => void;
    private _needsRender = true;
    private _lastRenderTime = -1;
    private _lastRAFTime = 0;
    private _rafMinIntervalMs = 0;
    private _pendingRenderRAF: number | null = null;
    private _pendingVisUpdate = false;
    private _handleImageLoaded: any;
    private _imageLoadDebounceTimeout: any;
    private _pendingImageLoads: Set<string> | null = null;
    private _interactionState: any = {
        hoverElementId: null,
        selectedElementId: null,
        draggingElementId: null,
        activeHandle: null,
        snapGuides: [],
    };
    private _interactionBoundsCache = new Map();
    private _interactionHandlesCache = new Map();
    // Explicit user-defined playback window (start/end in seconds). When set, replaces any scene-duration concept.
    private _playRangeStartSec: number | null = null;
    private _playRangeEndSec: number | null = null;
    private _diagnosticLogState = {
        webglContext: false,
        viewport: false,
    };
    private _canvasGuard: CanvasGuardHandle | null = null;
    constructor(canvas: HTMLCanvasElement, timingManager: any = null, options?: MIDIVisualizerCoreOptions) {
        if (!canvas) throw new Error('Canvas element is required');
        this.canvas = canvas;
        try {
            this._canvasGuard = guardCanvasAgainst2D(canvas, { label: 'preview-surface' });
        } catch (error) {
            console.warn('[MIDIVisualizerCore] failed to install canvas guard', error);
        }
        this._allowCanvasFallback = this._resolveCanvasFallbackAllowance(options);
        const factories = options?.rendererFactories ?? {};
        this._rendererFactories = {
            createCanvasRenderer: factories.createCanvasRenderer ?? (() => new ModularRenderer()),
            createWebGLRenderer: factories.createWebGLRenderer ?? (() => new WebGLRenderer()),
        };
        this._initializeViewportDimensions();
        this._setupImageLoadedListener();
        try {
            this.runtimeAdapter = new SceneRuntimeAdapter();
        } catch (error) {
            console.warn('[MIDIVisualizerCore] failed to initialize SceneRuntimeAdapter, falling back', error);
            this.runtimeAdapter = null;
        }
        const initialPreference = this._resolveInitialRendererPreference(options?.initialRenderer);
        this._applyRendererPreference(initialPreference, { recordFailure: true });
        this._settingsUnsubscribe = this._subscribeToRendererPreference();
        (window as any).vis = this; // debug helper
    }
    private _resolveCanvasFallbackAllowance(options?: MIDIVisualizerCoreOptions): boolean {
        if (typeof options?.allowCanvasFallback === 'boolean') {
            return options.allowCanvasFallback;
        }
        return isCanvasRendererAllowed();
    }

    private _initializeViewportDimensions(): void {
        const cssWidth = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.width || 1));
        const cssHeight = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.height || 1));
        this._viewportWidth = cssWidth;
        this._viewportHeight = cssHeight;
        this._devicePixelRatio = this._resolveDevicePixelRatio();
        this._applyBackingStoreDimensions(cssWidth, cssHeight, this._devicePixelRatio);
    }

    private _resolveDevicePixelRatio(): number {
        if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
            const ratio = window.devicePixelRatio;
            if (Number.isFinite(ratio) && ratio > 0) return ratio;
        }
        return 1;
    }

    private _normalizeDevicePixelRatio(value?: number): number {
        const ratio = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : this._resolveDevicePixelRatio();
        return Math.max(0.5, Math.min(8, ratio));
    }

    private _applyBackingStoreDimensions(width: number, height: number, devicePixelRatio: number): void {
        const pixelWidth = Math.max(1, Math.round(width * devicePixelRatio));
        const pixelHeight = Math.max(1, Math.round(height * devicePixelRatio));
        if (this.canvas.width !== pixelWidth) {
            this.canvas.width = pixelWidth;
        }
        if (this.canvas.height !== pixelHeight) {
            this.canvas.height = pixelHeight;
        }
    }

    private _ensureWebGLContext(): WebGLRenderingContext | WebGL2RenderingContext {
        if (this._webglContext && typeof (this._webglContext as WebGLRenderingContext).isContextLost === 'function') {
            if (!(this._webglContext as WebGLRenderingContext).isContextLost()) {
                return this._webglContext;
            }
            this._webglContext = null;
        }
        const attributes: WebGLContextAttributes = { antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false };
        let context: WebGLRenderingContext | WebGL2RenderingContext | null =
            (this.canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null) ?? null;
        let kind: RendererContextType = 'webgl2';
        if (!context) {
            context =
                (this.canvas.getContext('webgl', attributes) as WebGLRenderingContext | null) ??
                (this.canvas.getContext('experimental-webgl', attributes) as WebGLRenderingContext | null) ??
                null;
            kind = 'webgl';
        }
        if (!context) {
            throw new Error('Unable to acquire a WebGL rendering context for the preview canvas.');
        }
        this._webglContext = context;
        this._rendererContext = kind;
        return context;
    }

    private _bindContextLossHandlers(): void {
        this._contextLossUnsubscribe?.();
        this._contextLossUnsubscribe = attachContextLossHandlers(this.canvas, {
            onLost: (event) => {
                void event;
                this._handleWebGLContextLost();
            },
            onRestored: () => {
                this._handleWebGLContextRestored();
            },
        });
    }

    private _handleWebGLContextLost(): void {
        this._webglContext = null;
        this._needsRender = true;
        try {
            this._recordRenderError(new Error('WebGL context lost'));
        } catch {}
    }

    private _handleWebGLContextRestored(): void {
        this._webglContext = null;
        if (this._rendererPreference === 'webgl') {
            try {
                const dpr = this._resolveDevicePixelRatio();
                this._devicePixelRatio = dpr;
                this._applyBackingStoreDimensions(this._viewportWidth, this._viewportHeight, dpr);
                this._resizeRendererSurfaces(this._viewportWidth, this._viewportHeight, dpr);
                this.invalidateRender();
            } catch (error) {
                this._recordRenderError(error);
            }
        }
    }

    private _resolveInitialRendererPreference(initial?: SceneRendererType | null): SceneRendererType {
        if (initial) return this._normalizeRendererPreference(initial);
        try {
            const settings = useSceneStore.getState().settings;
            return this._normalizeRendererPreference(settings?.renderer);
        } catch {
            return 'webgl';
        }
    }

    private _normalizeRendererPreference(value: unknown): SceneRendererType {
        if (value === 'webgl') return 'webgl';
        if (value === 'canvas2d' && this._allowCanvasFallback) {
            return 'canvas2d';
        }
        return 'webgl';
    }

    private _subscribeToRendererPreference(): (() => void) | undefined {
        try {
            return useSceneStore.subscribe((state) => {
                const normalized = this._normalizeRendererPreference(state.settings.renderer);
                if (normalized === this._rendererPreference) return;
                this._applyRendererPreference(normalized, { recordFailure: true });
                this.invalidateRender();
            });
        } catch {
            return undefined;
        }
    }

    private _applyRendererPreference(preference: SceneRendererType, options?: { recordFailure?: boolean }): void {
        const normalized = this._normalizeRendererPreference(preference);
        if (normalized === 'webgl') {
            this._activateWebGLRenderer(options);
            return;
        }
        this._activateCanvasRenderer();
    }

    private _activateWebGLRenderer(options?: { recordFailure?: boolean }): void {
        this._shutdownWebGLRenderer();
        let renderer: WebGLRendererContract | null = null;
        try {
            const gl = this._ensureWebGLContext();
            renderer = this._rendererFactories.createWebGLRenderer();
            const initResult = renderer.init({
                canvas: this.canvas,
                context: gl,
                devicePixelRatio: this._devicePixelRatio,
            });
            this.webglRenderer = renderer;
            this.renderer = renderer as RendererContract<WebGLRenderPrimitive | RenderObject>;
            this._rendererPreference = 'webgl';
            this._rendererContext = initResult.contextType === 'webgl2' ? 'webgl2' : 'webgl';
            this._webglContext = initResult.context as WebGLRenderingContext | WebGL2RenderingContext;
            this._bindContextLossHandlers();
            this._logRendererEvent('webgl-context-acquired', {
                contextType: this._rendererContext,
                framebufferWidth: this.canvas.width,
                framebufferHeight: this.canvas.height,
            });
            this._resizeRendererSurfaces(this._viewportWidth, this._viewportHeight, this._devicePixelRatio);
        } catch (error) {
            try {
                renderer?.teardown();
            } catch {}
            if (options?.recordFailure !== false) {
                const previousPreference = this._rendererPreference;
                this._rendererPreference = 'webgl';
                this._recordRenderError(error);
                this._rendererPreference = previousPreference;
            }
            if (this._allowCanvasFallback) {
                console.warn('[MIDIVisualizerCore] failed to initialize WebGL renderer, falling back to canvas', error);
                this._activateCanvasRenderer();
            } else {
                this.renderer = null;
                this.webglRenderer = null;
                throw error;
            }
        }
    }

    private _activateCanvasRenderer(): void {
        if (!this._allowCanvasFallback) {
            throw new Error('Canvas renderer fallback is disabled.');
        }
        this._shutdownWebGLRenderer();
        if (!this._canvas2dContext) {
            const acquireContext = () => this.canvas.getContext('2d');
            const ctx = this._canvasGuard
                ? this._canvasGuard.temporarilyAllow2D('canvas-fallback', acquireContext)
                : acquireContext();
            if (!ctx) {
                throw new Error('Unable to acquire a 2D context for fallback rendering.');
            }
            this._canvas2dContext = ctx;
        }
        if (!this.modularRenderer) {
            this.modularRenderer = this._rendererFactories.createCanvasRenderer();
            const init = this.modularRenderer.init({ canvas: this.canvas, context: this._canvas2dContext });
            if (init.contextType !== 'canvas2d') {
                throw new Error('Canvas renderer must provide a canvas2d context.');
            }
        }
        this.renderer = this.modularRenderer as RendererContract<WebGLRenderPrimitive | RenderObject>;
        this._rendererPreference = 'canvas2d';
        this._rendererContext = 'canvas2d';
        this._resizeRendererSurfaces(this._viewportWidth, this._viewportHeight, this._devicePixelRatio);
    }

    private _shutdownWebGLRenderer(): void {
        this._contextLossUnsubscribe?.();
        this._contextLossUnsubscribe = undefined;
        if (this.webglRenderer) {
            try {
                this.webglRenderer.teardown();
            } catch {}
        }
        this.webglRenderer = null;
        if (this._rendererPreference === 'webgl') {
            this.renderer = null;
        }
    }

    private _deactivateWebGLRenderer(): void {
        this._shutdownWebGLRenderer();
    }

    private _recordRenderDiagnostics(
        input: RendererFrameInput<RenderObject | WebGLRenderPrimitive>,
        frameTimeMs: number
    ): void {
        try {
            const diagnosticsStore = useRenderDiagnosticsStore.getState();
            const rendererDiagnostics = this._extractRendererDiagnostics();
            diagnosticsStore.recordFrame({
                renderer: this._rendererPreference,
                contextType: this._rendererContext,
                frameHash: rendererDiagnostics?.frameHash ?? null,
                drawCalls: rendererDiagnostics?.drawCalls ?? null,
                bytesHashed: rendererDiagnostics?.bytesHashed ?? null,
                frameTimeMs,
                timestamp: Date.now(),
                target: input.target,
                resources: rendererDiagnostics?.resources,
                atlas: rendererDiagnostics?.atlas,
            });
        } catch {}
    }

    private _extractRendererDiagnostics(): RendererDiagnostics | null {
        if (this._rendererPreference !== 'webgl') {
            return null;
        }
        try {
            return this.webglRenderer?.diagnostics ?? null;
        } catch {
            return null;
        }
    }

    private _recordRenderError(error: unknown): void {
        if (!error) return;
        try {
            const err = error instanceof Error ? error : new Error(String(error));
            useRenderDiagnosticsStore.getState().recordError(err, { renderer: this._rendererPreference });
        } catch {}
    }

    private _logRendererEvent(
        event: 'webgl-context-acquired' | 'webgl-viewport-updated',
        payload: Record<string, unknown>
    ): void {
        const keyMap: Record<typeof event, keyof typeof this._diagnosticLogState> = {
            'webgl-context-acquired': 'webglContext',
            'webgl-viewport-updated': 'viewport',
        };
        const stateKey = keyMap[event];
        if (this._diagnosticLogState[stateKey]) {
            return;
        }
        this._diagnosticLogState[stateKey] = true;
        try {
            console.info(`[RendererDiagnostics] ${event}`, payload);
        } catch {}
    }

    private _now(): number {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    private _resizeRendererSurfaces(width: number, height: number, devicePixelRatio: number): void {
        this.modularRenderer?.resize({ width, height, devicePixelRatio });
        this.webglRenderer?.resize({ width, height, devicePixelRatio });
    }

    updateSceneElementTimingManager() {
        void loadDefaultScene('MIDIVisualizerCore.updateSceneElementTimingManager').then((loaded) => {
            if (loaded) {
                this.invalidateRender();
            }
        });
    }
    // Set the explicit playback range (in seconds) controlled by the external timeline/UI
    setPlayRange(startSec?: number | null, endSec?: number | null) {
        const s = typeof startSec === 'number' && isFinite(startSec) ? startSec : null;
        const e = typeof endSec === 'number' && isFinite(endSec) ? endSec : null;
        const changed = this._playRangeStartSec !== s || this._playRangeEndSec !== e;
        this._playRangeStartSec = s;
        this._playRangeEndSec = e;
        if (changed) this.invalidateRender();
    }
    seek(time: number) {
        const bufferTime = 0.5;
        // Prefer clamping to user-defined playback range if available
        if (this._playRangeStartSec != null || this._playRangeEndSec != null) {
            const minTime = (this._playRangeStartSec ?? 0) - bufferTime;
            const maxTime = (this._playRangeEndSec ?? Infinity) + bufferTime;
            this.currentTime = Math.max(minTime, Math.min(time, maxTime));
        } else {
            // Fallback: allow seeking slightly before 0 for pre-roll buffer only
            const minTime = -bufferTime;
            this.currentTime = Math.max(minTime, time);
        }
        if (this.isPlaying) this.startTime = performance.now() - (this.currentTime + 0.5) * 1000;
        this.invalidateRender();
    }
    getCurrentDuration() {
        // Derive duration from user-defined playback window when available
        if (
            this._playRangeStartSec != null &&
            this._playRangeEndSec != null &&
            this._playRangeEndSec > this._playRangeStartSec
        ) {
            return this._playRangeEndSec - this._playRangeStartSec;
        }
        const maxDuration = this._computeSceneDuration();
        const base = maxDuration > 0 ? maxDuration : this.duration;
        return base;
    }
    updateExportSettings(settings: any) {
        const sceneKeys = ['fps', 'width', 'height'];
        const scenePartial: any = {};
        for (const k of sceneKeys) if (k in settings) scenePartial[k] = settings[k];
        if (Object.keys(scenePartial).length) {
            const before = useSceneStore.getState().settings;
            const result = dispatchSceneCommand(
                { type: 'updateSceneSettings', patch: scenePartial },
                { source: 'MIDIVisualizerCore.updateExportSettings' }
            );
            if (!result.success) {
                console.warn('Failed to update scene settings', { scenePartial, error: result.error });
            }
            const updated = useSceneStore.getState().settings;
            const fps = Math.max(1, updated.fps ?? 60);
            this._rafMinIntervalMs = 1000 / fps;
            const widthChanged = 'width' in scenePartial && before.width !== updated.width;
            const heightChanged = 'height' in scenePartial && before.height !== updated.height;
            if ((widthChanged || heightChanged) && updated.width && updated.height) {
                this.resize(updated.width, updated.height);
            }
        }
        const remaining = { ...settings };
        sceneKeys.forEach((k) => delete remaining[k]);
        this.exportSettings = { ...this.exportSettings, ...remaining };
        this.invalidateRender();
    }
    getExportSettings() {
        const settings = useSceneStore.getState().settings;
        return { ...settings, ...this.exportSettings };
    }
    updateDebugSettings(settings: any) {
        this.debugSettings = { ...this.debugSettings, ...settings };
        this.invalidateRender();
    }
    getDebugSettings() {
        return { ...this.debugSettings };
    }
    stepForward() {
        const frameRate = useSceneStore.getState().settings.fps;
        const step = 1 / frameRate;
        const end = this._playRangeEndSec ?? this.currentTime + step;
        const newTime = Math.min(this.currentTime + step, end);
        this.seek(newTime);
    }
    stepBackward() {
        const frameRate = useSceneStore.getState().settings.fps;
        const step = 1 / frameRate;
        const minTime = this._playRangeStartSec != null ? this._playRangeStartSec : -0.5;
        const newTime = Math.max(this.currentTime - step, minTime);
        this.seek(newTime);
    }
    animate() {
        if (!this.isPlaying) return;
        try {
            const now = performance.now();
            if (this._rafMinIntervalMs > 0 && now - this._lastRAFTime < this._rafMinIntervalMs * 0.75) {
                this.animationId = requestAnimationFrame(() => this.animate());
                return;
            }
            const bufferTime = 0.5;
            this.currentTime = (now - this.startTime) / 1000 + bufferTime;
            // Do not auto-stop at scene-derived duration; external controller defines range/end behavior.
            this.render();
            this._lastRAFTime = now;
            this.animationId = requestAnimationFrame(() => this.animate());
        } catch (e) {
            console.error('Animation error', e);
            this.isPlaying = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }
    render() {
        if (this._needsRender || this.currentTime !== this._lastRenderTime || this.isPlaying) {
            this.renderAtTime(this.currentTime);
            this._needsRender = false;
            this._lastRenderTime = this.currentTime;
        }
    }
    invalidateRender() {
        this._needsRender = true;
        if (!this.isPlaying) {
            if (!this._pendingRenderRAF) {
                this._pendingRenderRAF = requestAnimationFrame(() => {
                    this._pendingRenderRAF = null;
                    try {
                        this.render();
                    } catch (e) {
                        console.warn('Deferred render failed', e);
                    }
                });
            }
        }
        if (this.canvas && !this._pendingVisUpdate) {
            this._pendingVisUpdate = true;
            Promise.resolve().then(() => {
                this._pendingVisUpdate = false;
                try {
                    this.canvas.dispatchEvent(new CustomEvent('visualizer-update'));
                } catch {}
            });
        }
    }
    private _disableRuntimeAdapter(reason: string, error?: unknown) {
        if (!this.runtimeAdapter) return;
        try {
            console.warn(`[MIDIVisualizerCore] disabling SceneRuntimeAdapter: ${reason}`, error);
        } catch {}
        try {
            this.runtimeAdapter.dispose();
        } catch {}
        this.runtimeAdapter = null;
    }
    private _getSceneElements(): SceneElement[] {
        if (!this.runtimeAdapter) {
            return [];
        }
        try {
            return this.runtimeAdapter.getElements();
        } catch (error) {
            this._disableRuntimeAdapter('getElements failed', error);
            return [];
        }
    }
    private _buildSceneRenderObjects(config: any, targetTime: number) {
        if (!this.runtimeAdapter) {
            return [];
        }
        try {
            return this.runtimeAdapter.buildScene(config, targetTime);
        } catch (error) {
            this._disableRuntimeAdapter('buildScene failed', error);
            return [];
        }
    }
    private _computeSceneDuration(): number {
        try {
            const elements = this.runtimeAdapter ? this.runtimeAdapter.getElements() : [];
            let max = 0;
            for (const el of elements) {
                const dur = (el as any).midiManager?.getDuration?.();
                if (typeof dur === 'number' && dur > max) max = dur;
            }
            const state: any = useTimelineStore.getState();
            const tm = getSharedTimingManager();
            const bpm = state.timeline?.globalBpm || 120;
            tm.setBPM(bpm);
            if (state.timeline?.masterTempoMap) tm.setTempoMap(state.timeline.masterTempoMap, 'seconds');
            for (const id of state.tracksOrder || []) {
                const track = state.tracks?.[id];
                if (!track || track.type !== 'midi' || !track.enabled) continue;
                const cache = state.midiCache?.[track.midiSourceId ?? id];
                if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
                const regionStartTick = track.regionStartTick ?? 0;
                const regionEndTick = track.regionEndTick ?? Number.POSITIVE_INFINITY;
                let maxEndTick = 0;
                for (const note of cache.notesRaw) {
                    if (note.endTick <= regionStartTick || note.startTick >= regionEndTick) continue;
                    const clippedEnd = Math.min(note.endTick, regionEndTick);
                    if (clippedEnd > maxEndTick) maxEndTick = clippedEnd;
                }
                const trackEndTick = maxEndTick + (track.offsetTicks ?? 0);
                if (trackEndTick <= 0) continue;
                const endBeats = trackEndTick / tm.ticksPerQuarter;
                const endSec = tm.beatsToSeconds(endBeats);
                if (endSec > max) max = endSec;
            }
            return max;
        } catch (error) {
            console.warn('[MIDIVisualizerCore] failed to compute scene duration', error);
            return this.duration;
        }
    }
    renderAtTime(targetTime: number) {
        const config = this.getSceneConfig();
        const renderObjects = this._buildSceneRenderObjects(config, targetTime);
        const overlays = this._buildInteractionOverlayObjects(targetTime, config);
        const frameObjects =
            overlays.length > 0 ? ([] as Array<RenderObject | WebGLRenderPrimitive>).concat(renderObjects, overlays) : renderObjects;
        this._renderFrame({ renderObjects: frameObjects, sceneConfig: config, timeSec: targetTime });
    }
    _setupImageLoadedListener() {
        document.removeEventListener('imageLoaded', this._handleImageLoaded);
        this._imageLoadDebounceTimeout = null;
        this._pendingImageLoads = new Set();
        this._handleImageLoaded = (event: any) => {
            if (event.detail?.imageSource) this._pendingImageLoads?.add(event.detail.imageSource);
            if (this._imageLoadDebounceTimeout) clearTimeout(this._imageLoadDebounceTimeout);
            this._imageLoadDebounceTimeout = setTimeout(() => {
                this.invalidateRender();
                this._pendingImageLoads?.clear();
                this._imageLoadDebounceTimeout = null;
            }, 50);
        };
        document.addEventListener('imageLoaded', this._handleImageLoaded);
    }
    resize(width: number, height: number, options?: { devicePixelRatio?: number }): void {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            console.warn('[MIDIVisualizerCore] resize invoked with invalid dimensions', { width, height });
            return;
        }
        const devicePixelRatio = this._normalizeDevicePixelRatio(options?.devicePixelRatio);
        this._devicePixelRatio = devicePixelRatio;
        this._viewportWidth = width;
        this._viewportHeight = height;
        this._applyBackingStoreDimensions(width, height, devicePixelRatio);
        this._resizeRendererSurfaces(width, height, devicePixelRatio);
        this._logRendererEvent('webgl-viewport-updated', {
            width,
            height,
            devicePixelRatio,
            framebufferWidth: this.canvas.width,
            framebufferHeight: this.canvas.height,
        });
        this.invalidateRender();
        try {
            if (!this.isPlaying) {
                const previewTime = this.currentTime < 0 ? 0 : this.currentTime;
                this.renderAtTime(previewTime);
            }
        } catch {}
    }
    getCurrentTime() {
        return this.currentTime;
    }
    getDuration() {
        return this.getCurrentDuration();
    }
    getIsPlaying() {
        return this.isPlaying;
    }
    getViewportSize(): { width: number; height: number } {
        return { width: this._viewportWidth, height: this._viewportHeight };
    }
    getDevicePixelRatio(): number {
        return this._devicePixelRatio;
    }
    getRenderObjects(targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        return this._buildSceneRenderObjects(config, targetTime);
    }
    renderWithCustomObjects(customRenderObjects: any[], targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        const base = this._buildSceneRenderObjects(config, targetTime);
        const overlays = this._buildInteractionOverlayObjects(targetTime, config);
        const all = ([] as Array<RenderObject | WebGLRenderPrimitive>).concat(base, customRenderObjects ?? [], overlays);
        this._renderFrame({ renderObjects: all, sceneConfig: config, timeSec: targetTime });
    }
    getSceneConfig() {
        const themeColors = {
            playheadColor: '#ff6b6b',
            textColor: '#ffffff',
            textTertiaryColor: '#cccccc',
            fontFamily: 'Arial',
            fontWeight: '400',
        };
        const s = this._playRangeStartSec;
        const e = this._playRangeEndSec;
        return {
            canvas: this.canvas,
            duration: this.duration,
            playRangeStartSec: s ?? 0,
            playRangeEndSec: e ?? this.getCurrentDuration(),
            isPlaying: this.isPlaying,
            backgroundColor: '#000000',
            showAnchorPoints: this.debugSettings.showAnchorPoints,
            viewportWidth: this._viewportWidth,
            viewportHeight: this._viewportHeight,
            devicePixelRatio: this._devicePixelRatio,
            rendererContext: this._rendererContext,
            ...themeColors,
        };
    }
    getPlayRange(): { startSec: number | null; endSec: number | null } {
        return { startSec: this._playRangeStartSec, endSec: this._playRangeEndSec };
    }
    setInteractionState(partial: any) {
        if (!this._interactionState) return;
        let changed = false;
        for (const k of Object.keys(partial || {})) {
            if (this._interactionState[k] !== partial[k]) {
                this._interactionState[k] = partial[k];
                changed = true;
            }
        }
        if (changed) this.invalidateRender();
    }
    getElementBoundsAtTime(targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        const elements = this._getSceneElements().filter((e: any) => e.visible);
        elements.sort((a: any, b: any) => (a.zIndex || 0) - (b.zIndex || 0));
        const results: any[] = [];
        for (const el of elements) {
            try {
                const ros: any[] = el.buildRenderObjects(config, targetTime);
                if (ros && ros.length) {
                    const container: any = ros[0];
                    if (container?.getBounds) {
                        const b = container.getBounds();
                        if (b && isFinite(b.x) && isFinite(b.y) && isFinite(b.width) && isFinite(b.height)) {
                            const corners = container._worldCorners
                                ? container._worldCorners.map((p: any) => ({ x: p.x, y: p.y }))
                                : null;
                            const baseBounds = container.baseBounds
                                ? {
                                      x: container.baseBounds.x,
                                      y: container.baseBounds.y,
                                      width: container.baseBounds.width,
                                      height: container.baseBounds.height,
                                  }
                                : null;
                            results.push({
                                id: el.id,
                                zIndex: el.zIndex || 0,
                                bounds: { ...b },
                                element: el,
                                corners,
                                baseBounds,
                            });
                        }
                    }
                }
            } catch {}
        }
        return results;
    }
    private _buildInteractionOverlayObjects(targetTime: number, config: any): RenderObject[] {
        if (!this._interactionState) return [];
        const { hoverElementId, selectedElementId, draggingElementId, activeHandle, snapGuides } =
            this._interactionState;
        const guides = Array.isArray(snapGuides) ? (snapGuides as SnapGuide[]) : [];
        if (!hoverElementId && !selectedElementId && !draggingElementId && guides.length === 0) return [];

        const overlays: RenderObject[] = [];
        const boundsList = this.getElementBoundsAtTime(targetTime);
        const boundsMap = new Map<string, any>();
        for (const record of boundsList) {
            boundsMap.set(record.id, record);
        }

        const viewportWidth = this._viewportWidth || config?.canvas?.width || this.canvas.width;
        const viewportHeight = this._viewportHeight || config?.canvas?.height || this.canvas.height;

        if (guides.length) {
            for (const guide of guides) {
                if (guide.orientation === 'vertical') {
                    const line = new Line(guide.position, 0, guide.position, viewportHeight, '#4C9AFF', 1.5, {
                        includeInLayoutBounds: false,
                    });
                    line.setOpacity(0.9);
                    overlays.push(line);
                } else {
                    const line = new Line(0, guide.position, viewportWidth, guide.position, '#4C9AFF', 1.5, {
                        includeInLayoutBounds: false,
                    });
                    line.setOpacity(0.9);
                    overlays.push(line);
                }
            }
            const snapSourceIds = new Set<string>();
            for (const guide of guides) {
                if (guide.sourceElementId) {
                    snapSourceIds.add(guide.sourceElementId);
                }
            }
            for (const id of snapSourceIds) {
                const record = boundsMap.get(id);
                if (!record) continue;
                overlays.push(
                    ...this._createSelectionOutline(record, '#4C9AFF', [4, 2], 1.5, 0.9)
                );
            }
        }

        if (selectedElementId && selectedElementId !== draggingElementId) {
            const record = boundsMap.get(selectedElementId);
            if (record) overlays.push(...this._createSelectionOutline(record, '#00FFFF', [6, 4], 2));
        }
        if (hoverElementId && hoverElementId !== draggingElementId && hoverElementId !== selectedElementId) {
            const record = boundsMap.get(hoverElementId);
            if (record) overlays.push(...this._createSelectionOutline(record, '#FFFF00', [6, 4], 2));
        }
        if (draggingElementId) {
            const record = boundsMap.get(draggingElementId);
            if (record) overlays.push(...this._createSelectionOutline(record, '#FF00FF', [6, 4], 2));
        }

        if (selectedElementId) {
            try {
                const handles = this.getSelectionHandlesAtTime(selectedElementId, targetTime);
                if (handles && handles.length) {
                    const rotHandle = handles.find((h: any) => h.type === 'rotate');
                    const anchorHandle = handles.find((h: any) => h.type === 'anchor');
                    if (rotHandle && anchorHandle) {
                        const connector = new Line(
                            anchorHandle.cx,
                            anchorHandle.cy - anchorHandle.size * 0.5,
                            rotHandle.cx,
                            rotHandle.cy,
                            '#FFA500',
                            1.5,
                            { includeInLayoutBounds: false }
                        );
                        connector.setLineCap('round');
                        overlays.push(connector);
                    }
                    for (const handle of handles) {
                        const isActive = activeHandle === handle.id;
                        if (handle.shape === 'circle') {
                            const arc = new Arc(handle.cx, handle.cy, handle.r ?? handle.size * 0.5, 0, Math.PI * 2, false, {
                                fillColor: '#FFA500',
                                strokeColor: isActive ? '#FF00FF' : '#FFFFFF',
                                strokeWidth: 2,
                                includeInLayoutBounds: false,
                            });
                            arc.setOpacity(0.95);
                            overlays.push(arc);
                        } else {
                            let fill = '#222222';
                            let stroke = '#FFFFFF';
                            if (handle.type.startsWith('scale')) {
                                fill = '#00AAFF';
                            } else if (handle.type === 'anchor') {
                                fill = '#FFFF00';
                                stroke = '#333333';
                            }
                            if (handle.type === 'rotate') {
                                fill = '#FFA500';
                            }
                            if (isActive) {
                                stroke = '#FF00FF';
                            }
                            const rect = new Rectangle(
                                handle.cx - handle.size * 0.5,
                                handle.cy - handle.size * 0.5,
                                handle.size,
                                handle.size,
                                fill,
                                stroke,
                                2,
                                { includeInLayoutBounds: false }
                            );
                            rect.setOpacity(0.95);
                            overlays.push(rect);
                        }
                    }
                }
            } catch {}
        }

        return overlays;
    }

    private _createSelectionOutline(
        record: any,
        color: string,
        dashPattern: number[],
        lineWidth: number,
        opacity = 1
    ): RenderObject[] {
        const overlays: RenderObject[] = [];
        const corners =
            record?.corners && record.corners.length === 4
                ? record.corners
                : [
                      { x: record.bounds.x, y: record.bounds.y },
                      { x: record.bounds.x + record.bounds.width, y: record.bounds.y },
                      { x: record.bounds.x + record.bounds.width, y: record.bounds.y + record.bounds.height },
                      { x: record.bounds.x, y: record.bounds.y + record.bounds.height },
                  ];
        if (!corners || corners.length !== 4) return overlays;
        for (let i = 0; i < corners.length; i++) {
            const start = corners[i];
            const end = corners[(i + 1) % corners.length];
            overlays.push(...this._createDashedLineSegments(start, end, color, lineWidth, dashPattern, opacity));
        }
        return overlays;
    }

    private _createDashedLineSegments(
        start: { x: number; y: number },
        end: { x: number; y: number },
        color: string,
        lineWidth: number,
        dashPattern: number[],
        opacity = 1
    ): Line[] {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!Number.isFinite(length) || length <= 0.0001) return [];
        if (!dashPattern || dashPattern.length === 0) {
            const line = new Line(start.x, start.y, end.x, end.y, color, lineWidth, { includeInLayoutBounds: false });
            line.setOpacity(opacity);
            return [line];
        }
        const segments: Line[] = [];
        let distance = 0;
        let patternIndex = 0;
        let draw = true;
        const safePattern = dashPattern.map((value) => Math.max(0, value));
        while (distance < length - 1e-6) {
            const segmentLength = safePattern[patternIndex % safePattern.length] || 0;
            if (segmentLength <= 0) {
                // Avoid zero-length loops by nudging forward slightly.
                distance += length * 1e-6;
                patternIndex += 1;
                draw = !draw;
                continue;
            }
            const startRatio = distance / length;
            const endDistance = Math.min(length, distance + segmentLength);
            const endRatio = endDistance / length;
            if (draw) {
                const sx = start.x + dx * startRatio;
                const sy = start.y + dy * startRatio;
                const ex = start.x + dx * endRatio;
                const ey = start.y + dy * endRatio;
                const line = new Line(sx, sy, ex, ey, color, lineWidth, { includeInLayoutBounds: false });
                line.setOpacity(opacity);
                segments.push(line);
            }
            distance = endDistance;
            patternIndex += 1;
            draw = !draw;
        }
        return segments;
    }
    getSelectionHandlesAtTime(elementId: string, targetTime = this.currentTime) {
        if (!elementId) return [];
        const boundsList = this.getElementBoundsAtTime(targetTime);
        const record: any = boundsList.find((b) => b.id === elementId);
        if (!record) return [];
        const b = record.bounds;
        const element = record.element;
        const handles: any[] = [];
        // Standardized handle sizing (previously varied with element size causing inconsistency)
        // Slightly larger than prior default upper bound for better UX.
        const size = 16; // px – uniform for all scale & anchor handles
        const anchorX = element ? element.anchorX : 0.5;
        const anchorY = element ? element.anchorY : 0.5;
        let anchorPixelX = b.x + b.width * anchorX;
        let anchorPixelY = b.y + b.height * anchorY;
        const oriented = record.corners && record.corners.length === 4 ? record.corners : null;
        const mid = (p1: any, p2: any) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
        const addHandle = (id: string, type: string, cx: number, cy: number, shape = 'rect', extra: any = {}) => {
            handles.push({ id, type, cx, cy, size, shape, r: size * 0.5, ...extra });
        };
        if (oriented) {
            addHandle('scale-nw', 'scale-nw', oriented[0].x, oriented[0].y);
            addHandle('scale-ne', 'scale-ne', oriented[1].x, oriented[1].y);
            addHandle('scale-se', 'scale-se', oriented[2].x, oriented[2].y);
            addHandle('scale-sw', 'scale-sw', oriented[3].x, oriented[3].y);
            const mTop = mid(oriented[0], oriented[1]);
            const mRight = mid(oriented[1], oriented[2]);
            const mBottom = mid(oriented[2], oriented[3]);
            const mLeft = mid(oriented[3], oriented[0]);
            addHandle('scale-n', 'scale-n', mTop.x, mTop.y);
            addHandle('scale-e', 'scale-e', mRight.x, mRight.y);
            addHandle('scale-s', 'scale-s', mBottom.x, mBottom.y);
            addHandle('scale-w', 'scale-w', mLeft.x, mLeft.y);
            const interp = (a: number, b: number, t: number) => a + (b - a) * t;
            const top = {
                x: interp(oriented[0].x, oriented[1].x, anchorX),
                y: interp(oriented[0].y, oriented[1].y, anchorX),
            };
            const bottom = {
                x: interp(oriented[3].x, oriented[2].x, anchorX),
                y: interp(oriented[3].y, oriented[2].y, anchorX),
            };
            const anchorPt = { x: interp(top.x, bottom.x, anchorY), y: interp(top.y, bottom.y, anchorY) };
            anchorPixelX = anchorPt.x;
            anchorPixelY = anchorPt.y;
        } else {
            addHandle('scale-nw', 'scale-nw', b.x, b.y);
            addHandle('scale-ne', 'scale-ne', b.x + b.width, b.y);
            addHandle('scale-se', 'scale-se', b.x + b.width, b.y + b.height);
            addHandle('scale-sw', 'scale-sw', b.x, b.y + b.height);
            addHandle('scale-n', 'scale-n', b.x + b.width / 2, b.y);
            addHandle('scale-e', 'scale-e', b.x + b.width, b.y + b.height / 2);
            addHandle('scale-s', 'scale-s', b.x + b.width / 2, b.y + b.height);
            addHandle('scale-w', 'scale-w', b.x, b.y + b.height / 2);
        }
        addHandle('anchor', 'anchor', anchorPixelX, anchorPixelY, 'rect');
        let rotHandleX: number;
        let rotHandleY: number;
        // Fixed rotation handle distance for consistency (was dependent on element height)
        const rotOffset = 40; // px
        if (oriented) {
            const topMid = { x: (oriented[0].x + oriented[1].x) / 2, y: (oriented[0].y + oriented[1].y) / 2 };
            const edgeVec = { x: oriented[1].x - oriented[0].x, y: oriented[1].y - oriented[0].y };
            const len = Math.hypot(edgeVec.x, edgeVec.y) || 1;
            let normal = { x: -edgeVec.y / len, y: edgeVec.x / len };
            const center = {
                x: (oriented[0].x + oriented[1].x + oriented[2].x + oriented[3].x) / 4,
                y: (oriented[0].y + oriented[1].y + oriented[2].y + oriented[3].y) / 4,
            };
            const toCenter = { x: center.x - topMid.x, y: center.y - topMid.y };
            if (normal.x * toCenter.x + normal.y * toCenter.y > 0) {
                normal.x *= -1;
                normal.y *= -1;
            }
            rotHandleX = topMid.x + normal.x * rotOffset;
            rotHandleY = topMid.y + normal.y * rotOffset;
        } else {
            const rotBaseX = b.x + b.width / 2;
            const rotBaseY = b.y;
            rotHandleX = rotBaseX;
            rotHandleY = rotBaseY - rotOffset;
        }
        // Rotation handle slightly larger circular target for easier grabbing
        const rotateSize = 24; // diameter basis (rect 'size' kept for consistency, r overrides hit test circle)
        handles.push({
            id: 'rotate',
            type: 'rotate',
            cx: rotHandleX,
            cy: rotHandleY,
            size: rotateSize,
            shape: 'circle',
            r: rotateSize * 0.5,
        });
        return handles;
    }
    getModularRenderer(): RendererContract<RenderObject> | null {
        return this.modularRenderer;
    }
    getAvailableSceneElementTypes() {
        return Promise.resolve(sceneElementRegistry.getElementTypeInfo());
    }
    addSceneElement(type: string, config: any = {}) {
        const elementId = typeof config?.id === 'string' && config.id.length ? config.id : `${type}_${Date.now()}`;
        const payloadConfig = { ...config };
        if (!payloadConfig.id) payloadConfig.id = elementId;
        const result = dispatchSceneCommand(
            { type: 'addElement', elementType: type, elementId, config: payloadConfig },
            { source: 'MIDIVisualizerCore.addSceneElement' }
        );
        if (!result.success) {
            console.warn('addSceneElement failed', { type, elementId, error: result.error });
            return null;
        }
        this.invalidateRender();
        try {
            return this.runtimeAdapter?.getElements().find((el) => el.id === elementId) ?? null;
        } catch {
            return null;
        }
    }
    removeSceneElement(elementId: string) {
        const result = dispatchSceneCommand(
            { type: 'removeElement', elementId },
            { source: 'MIDIVisualizerCore.removeSceneElement' }
        );
        if (result.success) this.invalidateRender();
        else console.warn('removeSceneElement failed', { elementId, error: result.error });
        return result.success;
    }
    updateSceneElementConfig(elementId: string, config: any) {
        const result = dispatchSceneCommand(
            { type: 'updateElementConfig', elementId, patch: config },
            { source: 'MIDIVisualizerCore.updateSceneElementConfig' }
        );
        if (result.success) this.invalidateRender();
        else console.warn('updateSceneElementConfig failed', { elementId, config, error: result.error });
        return result.success;
    }
    getSceneElementConfig(elementId: string) {
        const state = useSceneStore.getState();
        const element = state.elements[elementId];
        if (!element) return null;
        const bindings = state.bindings.byElement[elementId] ?? {};
        const config: Record<string, unknown> = { id: elementId, type: element.type };
        for (const [key, binding] of Object.entries(bindings)) {
            if (binding.type === 'macro') {
                config[key] = { type: 'macro', macroId: binding.macroId };
            } else {
                config[key] = binding.value;
            }
        }
        return config;
    }
    getSceneElements() {
        try {
            return this.runtimeAdapter?.getElements() ?? [];
        } catch {
            return [];
        }
    }
    exportSceneConfig() {
        return useSceneStore.getState().exportSceneDraft();
    }
    cleanup() {
        if (this._handleImageLoaded) document.removeEventListener('imageLoaded', this._handleImageLoaded);
        if (this._imageLoadDebounceTimeout) {
            clearTimeout(this._imageLoadDebounceTimeout);
            this._imageLoadDebounceTimeout = null;
        }
        this._pendingImageLoads?.clear();
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this._pendingRenderRAF) {
            cancelAnimationFrame(this._pendingRenderRAF);
            this._pendingRenderRAF = null;
        }
        this._settingsUnsubscribe?.();
        this._settingsUnsubscribe = undefined;
        try {
            useRenderDiagnosticsStore.getState().reset();
        } catch {}
        this._deactivateWebGLRenderer();
        this.modularRenderer?.teardown();
        this._canvasGuard?.release();
        this._canvasGuard = null;
    }
    private _renderFrame(input: RendererFrameInput<RenderObject | WebGLRenderPrimitive>) {
        const renderer = this.renderer;
        if (!renderer) return;
        const sceneConfig = {
            ...input.sceneConfig,
            canvas: this.canvas,
            viewportWidth: this._viewportWidth,
            viewportHeight: this._viewportHeight,
            devicePixelRatio: this._devicePixelRatio,
            rendererContext: this._rendererContext,
        };
        const frameInput: RendererFrameInput<WebGLRenderPrimitive | RenderObject> = {
            ...input,
            sceneConfig,
        };
        const start = this._now();
        try {
            renderer.renderFrame(frameInput);
            const elapsed = this._now() - start;
            this._recordRenderDiagnostics(frameInput, elapsed);
        } catch (error) {
            this._recordRenderError(error);
            throw error;
        }
    }
    getSceneElement(elementId: string) {
        try {
            return this.runtimeAdapter?.getElements().find((el) => el.id === elementId) ?? null;
        } catch {
            return null;
        }
    }
    setSceneElementVisibility(elementId: string, visible: boolean) {
        const result = dispatchSceneCommand(
            { type: 'updateElementConfig', elementId, patch: { visible } },
            { source: 'MIDIVisualizerCore.setSceneElementVisibility' }
        );
        if (result.success) this.invalidateRender();
    }
    setSceneElementZIndex(elementId: string, zIndex: number) {
        const result = dispatchSceneCommand(
            { type: 'updateElementConfig', elementId, patch: { zIndex } },
            { source: 'MIDIVisualizerCore.setSceneElementZIndex' }
        );
        if (result.success) this.invalidateRender();
    }
    moveSceneElement(elementId: string, newIndex: number) {
        const result = dispatchSceneCommand(
            { type: 'moveElement', elementId, targetIndex: newIndex },
            { source: 'MIDIVisualizerCore.moveSceneElement' }
        );
        if (result.success) this.invalidateRender();
        else console.warn('moveSceneElement failed', { elementId, newIndex, error: result.error });
    }
    duplicateSceneElement(sourceId: string, newId: string) {
        const result = dispatchSceneCommand(
            { type: 'duplicateElement', sourceId, newId },
            { source: 'MIDIVisualizerCore.duplicateSceneElement' }
        );
        if (!result.success) {
            console.warn('duplicateSceneElement failed', { sourceId, newId, error: result.error });
            return null;
        }
        this.invalidateRender();
        try {
            return this.runtimeAdapter?.getElements().find((el) => el.id === newId) ?? null;
        } catch {
            return null;
        }
    }
}
