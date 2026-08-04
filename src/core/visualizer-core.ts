/* eslint-disable @typescript-eslint/no-explicit-any */
import { ModularRenderer } from './render/modular-renderer';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import type { SceneElement } from '@core/scene/elements';
import { CANONICAL_PPQ } from './timing/ppq';
import { loadDefaultScene } from './default-scene-loader';
import { dispatchSceneCommand, SceneRuntimeAdapter } from '@state/scene';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';
import type { SnapGuide } from '@core/interaction/snapping';
import { PerspectiveElementRoot } from '@core/render/render-objects';
import { isFeatureEnabled } from '@utils/featureFlags';
import { selectionGeometry } from '@state/scene/selectionGeometry';
import { visualResourceCache } from '@core/resources/visual-resource-cache';

export class MIDIVisualizerCore {
    private static activeInstances = 0;
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
    modularRenderer = new ModularRenderer();
    runtimeAdapter: SceneRuntimeAdapter | null = null;
    private _needsRender = true;
    private _lastRenderTime = -1;
    private _lastRAFTime = 0;
    private _rafMinIntervalMs = 0;
    private _pendingRenderRAF: number | null = null;
    private _pendingVisUpdate = false;
    private _cleanedUp = false;
    private _renderCount = 0;
    private _invalidationCount = 0;
    private _totalRenderMilliseconds = 0;
    private _unsubscribeImageLoads: (() => void) | null = null;
    private _handleSceneRuntimeUpdated: (() => void) | null = null;
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
    private _transparentMode = false;
    constructor(canvas: HTMLCanvasElement, timingManager: any = null) {
        if (!canvas) throw new Error('Canvas element is required');
        this.canvas = canvas;
        MIDIVisualizerCore.activeInstances += 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2D context from canvas');
        this.ctx = ctx;
        this._setupImageLoadedListener();
        try {
            this.runtimeAdapter = new SceneRuntimeAdapter();
        } catch (error) {
            console.warn('[MIDIVisualizerCore] failed to initialize SceneRuntimeAdapter, falling back', error);
            this.runtimeAdapter = null;
        }
        this._handleSceneRuntimeUpdated = () => {
            this.invalidateRender();
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('mvmnt-scene-runtime-updated', this._handleSceneRuntimeUpdated as EventListener);
            window.addEventListener('mvmnt-scene-import-complete', this._handleSceneRuntimeUpdated as EventListener);
        }
        (window as any).vis = this; // debug helper
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
        this._invalidationCount += 1;
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
        const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const config = this.getSceneConfig();
        const renderObjects = this._buildSceneRenderObjects(config, targetTime);
        this.modularRenderer.render(this.ctx, renderObjects, config, targetTime);
        try {
            this._renderInteractionOverlays(targetTime, config);
        } catch {}
        this._renderCount += 1;
        this._totalRenderMilliseconds +=
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    }
    getPerformanceDiagnostics() {
        return {
            activeVisualizerInstances: MIDIVisualizerCore.activeInstances,
            renderCount: this._renderCount,
            invalidationCount: this._invalidationCount,
            totalRenderMilliseconds: this._totalRenderMilliseconds,
            averageRenderMilliseconds: this._renderCount ? this._totalRenderMilliseconds / this._renderCount : 0,
            runtime: this.runtimeAdapter?.collectDiagnostics() ?? null,
        };
    }
    _setupImageLoadedListener() {
        this._unsubscribeImageLoads?.();
        this._unsubscribeImageLoads = visualResourceCache.subscribeToLoads(() => this.invalidateRender());
    }
    resize(width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
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
        this.modularRenderer.render(this.ctx, all, config, targetTime);
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
            transparent: this._transparentMode ?? false,
            showAnchorPoints: this.debugSettings.showAnchorPoints,
            ...themeColors,
        };
    }
    getPlayRange(): { startSec: number | null; endSec: number | null } {
        return { startSec: this._playRangeStartSec, endSec: this._playRangeEndSec };
    }
    setTransparentMode(transparent: boolean) {
        this._transparentMode = transparent;
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
        if (!this.runtimeAdapter?.resolveFrame) {
            const config = this.getSceneConfig();
            return (this._getSceneElements?.() ?? []).flatMap((element: any) => {
                if (!element.visible) return [];
                const payload = element.buildRenderObjects(config, targetTime)?.[0];
                const bounds = payload?.getVisualBounds?.() ?? payload?.getBounds?.();
                return bounds
                    ? [
                          {
                              id: element.id,
                              zIndex: 0,
                              bounds,
                              element,
                              corners: payload._worldCorners ?? null,
                          },
                      ]
                    : [];
            });
        }
        const frame = this.runtimeAdapter.resolveFrame(this.getSceneConfig(), targetTime);
        return frame.elements.flatMap((record) => {
            const el: any = record.element;
            const container: any = record.renderObjects[0];
            const b = record.artworkBounds;
            if (!el || !container || !b) return [];
            const perspective = container instanceof PerspectiveElementRoot ? container : null;
            return [
                {
                    id: record.elementId,
                    nodeId: record.node.id,
                    zIndex: record.paintIndex,
                    bounds: { ...b },
                    element: el,
                    corners: record.artworkHull ?? null,
                    baseBounds: container.baseBounds ? { ...container.baseBounds } : null,
                    effectiveVisible: record.effectiveVisible,
                    effectiveLocked: record.effectiveLocked,
                    isPerspective: Boolean(perspective?.warpMatrix),
                    warp: perspective?.perspectiveWarp ?? null,
                    affineTransform: perspective?.getAffineTransform() ?? null,
                    projectedAnchor:
                        perspective?.projectNormalizedPoint({ x: el.anchorX ?? 0.5, y: el.anchorY ?? 0.5 }) ?? null,
                    projectedHandlePoints: perspective
                        ? {
                              MTop: perspective.projectNormalizedPoint({ x: 0.5, y: 0 }),
                              MRight: perspective.projectNormalizedPoint({ x: 1, y: 0.5 }),
                              MBottom: perspective.projectNormalizedPoint({ x: 0.5, y: 1 }),
                              MLeft: perspective.projectNormalizedPoint({ x: 0, y: 0.5 }),
                          }
                        : null,
                },
            ];
        });
    }
    getResolvedSceneFrame(targetTime = this.currentTime) {
        return this.runtimeAdapter?.resolveFrame(this.getSceneConfig(), targetTime) ?? null;
    }
    getNodeSelectionAtTime(nodeIds: string[], targetTime = this.currentTime) {
        const frame = this.getResolvedSceneFrame(targetTime);
        return frame ? selectionGeometry(frame, nodeIds) : null;
    }
    _renderInteractionOverlays(targetTime: number, config: any) {
        if (!this._interactionState) return;
        const {
            hoverElementId,
            selectedElementId,
            selectedNodeIds,
            draggingElementId,
            activeHandle,
            snapGuides,
            marqueeBounds,
            selectionPivot,
        } = this._interactionState;
        const nodeIds = Array.isArray(selectedNodeIds) ? selectedNodeIds : [];
        const guides = Array.isArray(snapGuides) ? (snapGuides as SnapGuide[]) : [];
        if (
            !hoverElementId &&
            !selectedElementId &&
            !nodeIds.length &&
            !draggingElementId &&
            guides.length === 0 &&
            !marqueeBounds
        )
            return;
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
        const rect = this.canvas.getBoundingClientRect();
        const pixelScale = rect.width > 0 ? this.canvas.width / rect.width : 1;
        ctx.lineWidth = Math.max(1, pixelScale);
        ctx.setLineDash([]);
        if (marqueeBounds) {
            ctx.fillStyle = 'rgba(17, 119, 187, 0.12)';
            ctx.strokeStyle = '#5cc8ff';
            if ((marqueeBounds as any).direction === 'intersection') ctx.setLineDash([5 * pixelScale, 3 * pixelScale]);
            ctx.fillRect(marqueeBounds.x, marqueeBounds.y, marqueeBounds.width, marqueeBounds.height);
            ctx.strokeRect(marqueeBounds.x, marqueeBounds.y, marqueeBounds.width, marqueeBounds.height);
            ctx.setLineDash([]);
        }
        const nodeSelection = nodeIds.length ? this.getNodeSelectionAtTime(nodeIds, targetTime) : null;
        if (nodeSelection) {
            if (nodeIds.length > 1) {
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = '#5cc8ff';
                for (const record of nodeSelection.records) {
                    if (!record.artworkBounds) continue;
                    const hull = record.artworkHull;
                    if (hull?.length) {
                        ctx.beginPath();
                        ctx.moveTo(hull[0].x, hull[0].y);
                        for (let index = 1; index < hull.length; index += 1) ctx.lineTo(hull[index].x, hull[index].y);
                        ctx.closePath();
                        ctx.stroke();
                    } else {
                        ctx.strokeRect(
                            record.artworkBounds.x,
                            record.artworkBounds.y,
                            record.artworkBounds.width,
                            record.artworkBounds.height
                        );
                    }
                }
                ctx.restore();
            }
            ctx.strokeStyle = '#5cc8ff';
            if (nodeSelection.corners?.length === 4) {
                ctx.beginPath();
                ctx.moveTo(nodeSelection.corners[0].x, nodeSelection.corners[0].y);
                for (let index = 1; index < 4; index += 1)
                    ctx.lineTo(nodeSelection.corners[index].x, nodeSelection.corners[index].y);
                ctx.closePath();
                ctx.stroke();
            } else {
                ctx.strokeRect(
                    nodeSelection.bounds.x,
                    nodeSelection.bounds.y,
                    nodeSelection.bounds.width,
                    nodeSelection.bounds.height
                );
            }
        } else if (selectedElementId && selectedElementId !== draggingElementId) draw(selectedElementId, '#5cc8ff');
        if (hoverElementId && hoverElementId !== draggingElementId && hoverElementId !== selectedElementId)
            draw(hoverElementId, 'rgba(255,255,255,0.78)');
        if (selectedElementId || nodeIds.length) {
            try {
                const handles = nodeIds.length
                    ? this.getSelectionHandlesForNodesAtTime(nodeIds, targetTime, selectionPivot)
                    : this.getSelectionHandlesAtTime(selectedElementId, targetTime);
                if (handles && handles.length) {
                    const rotHandle = handles.find((h: any) => h.type === 'rotate');
                    const anchorHandle = handles.find((h: any) => h.type === 'anchor' || h.type === 'pivot');
                    if (rotHandle && anchorHandle) {
                        ctx.save();
                        ctx.setLineDash([]);
                        ctx.strokeStyle = 'rgba(92,200,255,0.75)';
                        ctx.lineWidth = Math.max(1, pixelScale);
                        ctx.beginPath();
                        ctx.moveTo(anchorHandle.cx, anchorHandle.cy - anchorHandle.size * 0.5);
                        ctx.lineTo(rotHandle.cx, rotHandle.cy);
                        ctx.stroke();
                        ctx.restore();
                    }
                    for (const h of handles) {
                        ctx.save();
                        ctx.setLineDash([]);
                        let fill = '#f8fafc';
                        let stroke = '#0e639c';
                        if (h.type.startsWith('scale')) {
                            fill = '#f8fafc';
                            stroke = '#0e639c';
                        } else if (h.type.startsWith('warp')) {
                            fill = '#C084FC';
                            stroke = '#FFFFFF';
                        } else if (h.type === 'rotate') {
                            fill = '#252526';
                            stroke = '#5cc8ff';
                        } else if (h.type === 'anchor' || h.type === 'pivot') {
                            fill = '#f8fafc';
                            stroke = '#0e639c';
                        }
                        if (activeHandle === h.id) fill = '#5cc8ff';
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
        const resolvedRecord = this.getResolvedSceneFrame(targetTime)?.byElementId.get(elementId);
        if (!resolvedRecord || resolvedRecord.effectiveLocked || resolvedRecord.effectiveVisible === false) return [];
        return this.getSelectionHandlesForNodesAtTime([resolvedRecord.node.id], targetTime);

        /* Legacy element-owned handle geometry is intentionally retained below for source
         * history only; selection now always uses the host-node pivot path above. */
        const boundsList = this.getElementBoundsAtTime(targetTime);
        const record: any = boundsList.find((b) => b.id === elementId);
        if (!record || record.effectiveLocked || record.effectiveVisible === false) return [];
        const b = record.bounds;
        const element = record.element;
        const handles: any[] = [];
        // Standardized handle sizing (previously varied with element size causing inconsistency)
        // Slightly larger than prior default upper bound for better UX.
        const rect = this.canvas.getBoundingClientRect();
        const pixelScale = rect.width > 0 ? this.canvas.width / rect.width : 1;
        const size = 8 * pixelScale;
        const anchorX = element ? element.anchorX : 0.5;
        const anchorY = element ? element.anchorY : 0.5;
        let anchorPixelX = b.x + b.width * anchorX;
        let anchorPixelY = b.y + b.height * anchorY;
        if (record.projectedAnchor) {
            anchorPixelX = record.projectedAnchor.x;
            anchorPixelY = record.projectedAnchor.y;
        }
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
            const topMid = mid(oriented[0], oriented[1]);
            const rightMid = mid(oriented[1], oriented[2]);
            const bottomMid = mid(oriented[2], oriented[3]);
            const leftMid = mid(oriented[3], oriented[0]);
            addHandle('scale-n', 'scale-n', topMid.x, topMid.y);
            addHandle('scale-e', 'scale-e', rightMid.x, rightMid.y);
            addHandle('scale-s', 'scale-s', bottomMid.x, bottomMid.y);
            addHandle('scale-w', 'scale-w', leftMid.x, leftMid.y);
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
            if (!record.projectedAnchor) {
                anchorPixelX = anchorPt.x;
                anchorPixelY = anchorPt.y;
            }
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
        const rotOffset = 28 * pixelScale;
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
        const rotateSize = 12 * pixelScale;
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
    getSelectionHandlesForNodesAtTime(
        nodeIds: string[],
        targetTime = this.currentTime,
        explicitPivot?: { x: number; y: number } | null
    ) {
        const selection = this.getNodeSelectionAtTime(nodeIds, targetTime);
        if (!selection) return [];
        const { bounds: b } = selection;
        const pivot = explicitPivot ?? selection.pivot;
        const rect = this.canvas.getBoundingClientRect();
        const pixelScale = rect.width > 0 ? this.canvas.width / rect.width : 1;
        const size = 8 * pixelScale;
        const corners = selection.corners;
        const points =
            corners?.length === 4
                ? [
                      ['scale-nw', corners[0].x, corners[0].y],
                      ['scale-ne', corners[1].x, corners[1].y],
                      ['scale-se', corners[2].x, corners[2].y],
                      ['scale-sw', corners[3].x, corners[3].y],
                  ]
                : [
                      ['scale-nw', b.x, b.y],
                      ['scale-ne', b.x + b.width, b.y],
                      ['scale-se', b.x + b.width, b.y + b.height],
                      ['scale-sw', b.x, b.y + b.height],
                  ];
        const showNonUniformHandles = nodeIds.length === 1 && selection.records[0]?.node.kind === 'element';
        const sidePoints = !showNonUniformHandles
            ? []
            : corners?.length === 4
              ? [
                    ['scale-n', (corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2],
                    ['scale-e', (corners[1].x + corners[2].x) / 2, (corners[1].y + corners[2].y) / 2],
                    ['scale-s', (corners[2].x + corners[3].x) / 2, (corners[2].y + corners[3].y) / 2],
                    ['scale-w', (corners[3].x + corners[0].x) / 2, (corners[3].y + corners[0].y) / 2],
                ]
              : [
                    ['scale-n', b.x + b.width / 2, b.y],
                    ['scale-e', b.x + b.width, b.y + b.height / 2],
                    ['scale-s', b.x + b.width / 2, b.y + b.height],
                    ['scale-w', b.x, b.y + b.height / 2],
                ];
        const topMid =
            corners?.length === 4
                ? { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }
                : { x: b.x + b.width / 2, y: b.y };
        let rotatePoint = { x: topMid.x, y: topMid.y - 28 * pixelScale };
        if (corners?.length === 4) {
            const edge = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
            const length = Math.hypot(edge.x, edge.y) || 1;
            let normal = { x: -edge.y / length, y: edge.x / length };
            if (normal.x * (pivot.x - topMid.x) + normal.y * (pivot.y - topMid.y) > 0) {
                normal = { x: -normal.x, y: -normal.y };
            }
            rotatePoint = {
                x: topMid.x + normal.x * 28 * pixelScale,
                y: topMid.y + normal.y * 28 * pixelScale,
            };
        }
        return [
            ...points.map(([id, cx, cy]) => ({ id, type: id, cx, cy, size, shape: 'rect', r: size / 2 })),
            ...sidePoints.map(([id, cx, cy]) => ({ id, type: id, cx, cy, size, shape: 'rect', r: size / 2 })),
            {
                id: 'rotate',
                type: 'rotate',
                cx: rotatePoint.x,
                cy: rotatePoint.y,
                size: 12 * pixelScale,
                shape: 'circle',
                r: 6 * pixelScale,
            },
            { id: 'pivot', type: 'pivot', cx: pivot.x, cy: pivot.y, size, shape: 'circle', r: size / 2 },
        ];
    }
    getModularRenderer() {
        return this.modularRenderer;
    }
    getPerspectiveDiagnostics() {
        return this.modularRenderer.getPerspectiveDiagnostics();
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
            } else if (binding.type === 'keyframes') {
                config[key] = { type: 'keyframes', channelId: binding.channelId };
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
        if (this._cleanedUp) return;
        this._cleanedUp = true;
        this._unsubscribeImageLoads?.();
        this._unsubscribeImageLoads = null;
        if (this._handleSceneRuntimeUpdated && typeof window !== 'undefined') {
            window.removeEventListener('mvmnt-scene-runtime-updated', this._handleSceneRuntimeUpdated as EventListener);
            window.removeEventListener('mvmnt-scene-import-complete', this._handleSceneRuntimeUpdated as EventListener);
            this._handleSceneRuntimeUpdated = null;
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this._pendingRenderRAF) {
            cancelAnimationFrame(this._pendingRenderRAF);
            this._pendingRenderRAF = null;
        }
        this._pendingVisUpdate = false;
        this.runtimeAdapter?.dispose();
        this.runtimeAdapter = null;
        this._interactionBoundsCache.clear();
        this._interactionHandlesCache.clear();
        this.modularRenderer.dispose();
        if (typeof window !== 'undefined') {
            try {
                if ((window as any).vis === this) delete (window as any).vis;
                if ((window as any).debugVisualizer === this) delete (window as any).debugVisualizer;
            } catch {
                /* non-fatal debug cleanup */
            }
        }
        MIDIVisualizerCore.activeInstances = Math.max(0, MIDIVisualizerCore.activeInstances - 1);
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
