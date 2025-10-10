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
import type { WebGLRenderPrimitive, RendererDiagnostics } from './render/webgl/types';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { SceneElement } from '@core/scene/elements';
import { CANONICAL_PPQ } from './timing/ppq';
import { loadDefaultScene } from './default-scene-loader';
import { dispatchSceneCommand, SceneRuntimeAdapter, useRenderDiagnosticsStore } from '@state/scene';
import { useSceneStore, type SceneRendererType } from '@state/sceneStore';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import type { SnapGuide } from '@core/interaction/snapping';

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
}

export class MIDIVisualizerCore {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    events: any[] = [];
    duration = 0;
    isPlaying = false;
    startTime = 0;
    animationId: number | null = null;
    currentTime = -0.5;
    exportSettings: any = { fullDuration: true };
    debugSettings: any = { showAnchorPoints: false, showDevelopmentOverlay: false };
    modularRenderer: RendererContract<RenderObject>;
    renderer: RendererContract<WebGLRenderPrimitive | RenderObject>;
    webglRenderer: WebGLRendererContract | null = null;
    runtimeAdapter: SceneRuntimeAdapter | null = null;
    private readonly _rendererFactories: {
        createCanvasRenderer: () => RendererContract<RenderObject>;
        createWebGLRenderer: () => WebGLRendererContract;
    };
    private _rendererPreference: SceneRendererType = 'canvas2d';
    private _rendererContext: RendererContextType = 'canvas2d';
    private _webglSurface: HTMLCanvasElement | null = null;
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
    constructor(canvas: HTMLCanvasElement, timingManager: any = null, options?: MIDIVisualizerCoreOptions) {
        if (!canvas) throw new Error('Canvas element is required');
        this.canvas = canvas;
        const factories = options?.rendererFactories ?? {};
        this._rendererFactories = {
            createCanvasRenderer: factories.createCanvasRenderer ?? (() => new ModularRenderer()),
            createWebGLRenderer: factories.createWebGLRenderer ?? (() => new WebGLRenderer()),
        };
        this.modularRenderer = this._rendererFactories.createCanvasRenderer();
        this.renderer = this.modularRenderer;
        const initResult = this._initRenderer();
        this.ctx = initResult.context as CanvasRenderingContext2D;
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
    private _initRenderer(): RendererInitResult {
        const initResult = this.modularRenderer.init({ canvas: this.canvas });
        if (initResult.contextType !== 'canvas2d') {
            throw new Error('MIDIVisualizerCore requires a canvas2d renderer implementation');
        }
        this._rendererContext = initResult.contextType;
        return initResult;
    }

    private _resolveInitialRendererPreference(initial?: SceneRendererType | null): SceneRendererType {
        if (initial) return this._normalizeRendererPreference(initial);
        try {
            const settings = useSceneStore.getState().settings;
            return this._normalizeRendererPreference(settings?.renderer);
        } catch {
            return 'canvas2d';
        }
    }

    private _normalizeRendererPreference(value: unknown): SceneRendererType {
        return value === 'webgl' ? 'webgl' : 'canvas2d';
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
        this._deactivateWebGLRenderer();
    }

    private _activateWebGLRenderer(options?: { recordFailure?: boolean }): void {
        const surface = this._ensureWebGLSurface();
        this.webglRenderer?.teardown();
        this.webglRenderer = null;
        let renderer: WebGLRendererContract | null = null;
        try {
            renderer = this._rendererFactories.createWebGLRenderer();
            const initResult = renderer.init({ canvas: surface });
            this.webglRenderer = renderer;
            this.renderer = renderer as RendererContract<WebGLRenderPrimitive | RenderObject>;
            this._rendererPreference = 'webgl';
            this._rendererContext = initResult.contextType === 'webgl2' ? 'webgl2' : 'webgl';
            this._syncWebGLSurfaceSize();
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
            this._deactivateWebGLRenderer();
            console.warn('[MIDIVisualizerCore] failed to initialize WebGL renderer, falling back to canvas', error);
        }
    }

    private _deactivateWebGLRenderer(): void {
        if (this.webglRenderer) {
            try {
                this.webglRenderer.teardown();
            } catch {}
        }
        this.webglRenderer = null;
        this.renderer = this.modularRenderer;
        this._rendererPreference = 'canvas2d';
        this._rendererContext = 'canvas2d';
        this._releaseWebGLSurface();
    }

    private _ensureWebGLSurface(): HTMLCanvasElement {
        if (this._webglSurface) {
            return this._webglSurface;
        }
        const surface = this.canvas.ownerDocument?.createElement?.('canvas') ?? document.createElement('canvas');
        surface.width = this.canvas.width;
        surface.height = this.canvas.height;
        this._webglSurface = surface;
        return surface;
    }

    private _syncWebGLSurfaceSize(): void {
        if (!this._webglSurface) return;
        if (this._webglSurface.width !== this.canvas.width) {
            this._webglSurface.width = this.canvas.width;
        }
        if (this._webglSurface.height !== this.canvas.height) {
            this._webglSurface.height = this.canvas.height;
        }
        this.webglRenderer?.resize({ width: this.canvas.width, height: this.canvas.height });
    }

    private _releaseWebGLSurface(): void {
        if (!this._webglSurface) return;
        this._webglSurface = null;
    }

    private _resolveRendererCanvas(): HTMLCanvasElement {
        if (this._rendererPreference === 'webgl' && this._webglSurface) {
            return this._webglSurface;
        }
        return this.canvas;
    }

    private _blitWebGLSurface(): void {
        if (!this._webglSurface) return;
        try {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this._webglSurface, 0, 0, this.canvas.width, this.canvas.height);
        } catch (error) {
            console.warn('[MIDIVisualizerCore] failed to composite WebGL surface onto canvas', error);
        }
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

    private _now(): number {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    private _resizeRendererSurfaces(width: number, height: number): void {
        this.modularRenderer.resize({ width, height });
        if (this._rendererPreference === 'webgl') {
            if (this._webglSurface) {
                this._webglSurface.width = width;
                this._webglSurface.height = height;
            }
            this.webglRenderer?.resize({ width, height });
        }
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
        this._renderFrame({ renderObjects, sceneConfig: config, timeSec: targetTime });
        try {
            this._renderInteractionOverlays(targetTime, config);
        } catch {}
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
    resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this._resizeRendererSurfaces(width, height);
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
    getRenderObjects(targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        return this._buildSceneRenderObjects(config, targetTime);
    }
    renderWithCustomObjects(customRenderObjects: any[], targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        const base = this._buildSceneRenderObjects(config, targetTime);
        const all = [...base, ...customRenderObjects];
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
    _renderInteractionOverlays(targetTime: number, config: any) {
        if (!this._interactionState) return;
        const { hoverElementId, selectedElementId, draggingElementId, activeHandle, snapGuides } =
            this._interactionState;
        const guides = Array.isArray(snapGuides) ? (snapGuides as SnapGuide[]) : [];
        if (!hoverElementId && !selectedElementId && !draggingElementId && guides.length === 0) return;
        const ctx = this.ctx;
        ctx.save();
        const boundsList = this.getElementBoundsAtTime(targetTime);
        const draw = (id: string, strokeStyle: string) => {
            if (!id) return;
            const rec: any = boundsList.find((r) => r.id === id);
            if (!rec) return;
            ctx.strokeStyle = strokeStyle;
            if (rec.corners && rec.corners.length === 4) {
                ctx.beginPath();
                ctx.moveTo(rec.corners[0].x, rec.corners[0].y);
                for (let i = 1; i < rec.corners.length; i++) ctx.lineTo(rec.corners[i].x, rec.corners[i].y);
                ctx.closePath();
                ctx.stroke();
            } else {
                const b = rec.bounds;
                ctx.strokeRect(b.x, b.y, b.width, b.height);
            }
        };
        if (guides.length) {
            ctx.save();
            ctx.setLineDash([]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#4C9AFF';
            ctx.globalAlpha = 0.9;
            for (const guide of guides) {
                ctx.beginPath();
                if (guide.orientation === 'vertical') {
                    ctx.moveTo(guide.position, 0);
                    ctx.lineTo(guide.position, this.canvas.height);
                } else {
                    ctx.moveTo(0, guide.position);
                    ctx.lineTo(this.canvas.width, guide.position);
                }
                ctx.stroke();
            }
            const snapSourceIds = new Set<string>();
            for (const guide of guides) {
                if (guide.sourceElementId) {
                    snapSourceIds.add(guide.sourceElementId);
                }
            }
            if (snapSourceIds.size) {
                ctx.save();
                ctx.setLineDash([4, 2]);
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.9;
                for (const id of snapSourceIds) {
                    draw(id, '#4C9AFF');
                }
                ctx.restore();
            }
            ctx.restore();
        }
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        if (selectedElementId && selectedElementId !== draggingElementId) draw(selectedElementId, '#00FFFF');
        if (hoverElementId && hoverElementId !== draggingElementId && hoverElementId !== selectedElementId)
            draw(hoverElementId, '#FFFF00');
        if (draggingElementId) draw(draggingElementId, '#FF00FF');
        if (selectedElementId) {
            try {
                const handles = this.getSelectionHandlesAtTime(selectedElementId, targetTime);
                if (handles && handles.length) {
                    const rotHandle = handles.find((h: any) => h.type === 'rotate');
                    const anchorHandle = handles.find((h: any) => h.type === 'anchor');
                    if (rotHandle && anchorHandle) {
                        ctx.save();
                        ctx.setLineDash([]);
                        ctx.strokeStyle = '#FFA500';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(anchorHandle.cx, anchorHandle.cy - anchorHandle.size * 0.5);
                        ctx.lineTo(rotHandle.cx, rotHandle.cy);
                        ctx.stroke();
                        ctx.restore();
                    }
                    for (const h of handles) {
                        ctx.save();
                        ctx.setLineDash([]);
                        let fill = '#222';
                        let stroke = '#FFF';
                        if (h.type.startsWith('scale')) {
                            fill = '#00AAFF';
                            stroke = '#FFFFFF';
                        } else if (h.type === 'rotate') {
                            fill = '#FFA500';
                            stroke = '#FFFFFF';
                        } else if (h.type === 'anchor') {
                            fill = '#FFFF00';
                            stroke = '#333333';
                        }
                        if (activeHandle === h.id) stroke = '#FF00FF';
                        ctx.strokeStyle = stroke;
                        ctx.fillStyle = fill;
                        if (h.shape === 'circle') {
                            ctx.beginPath();
                            ctx.arc(h.cx, h.cy, h.r, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.stroke();
                        } else {
                            ctx.beginPath();
                            ctx.rect(h.cx - h.size * 0.5, h.cy - h.size * 0.5, h.size, h.size);
                            ctx.fill();
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                }
            } catch {}
        }
        ctx.restore();
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
    getModularRenderer() {
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
        this.modularRenderer.teardown();
    }
    private _renderFrame(input: RendererFrameInput<RenderObject | WebGLRenderPrimitive>) {
        const renderer = this.renderer;
        if (!renderer) return;
        const frameCanvas = this._resolveRendererCanvas();
        const frameInput: RendererFrameInput<WebGLRenderPrimitive | RenderObject> = {
            ...input,
            sceneConfig: { ...input.sceneConfig, canvas: frameCanvas },
        };
        const start = this._now();
        try {
            renderer.renderFrame(frameInput);
            if (this._rendererPreference === 'webgl') {
                this._blitWebGLSurface();
            }
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
