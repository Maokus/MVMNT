/* Phase 1 TS migration - minimal typing + cleanup of import extensions */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ModularRenderer } from './render/modular-renderer';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { HybridSceneBuilder } from './scene-builder';

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
    debugSettings: any = { showAnchorPoints: false };
    modularRenderer = new ModularRenderer();
    sceneBuilder = new HybridSceneBuilder();
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
    };
    private _interactionBoundsCache = new Map();
    private _interactionHandlesCache = new Map();
    // When true, do not stop/clamp playback at scene duration; external controller (Timeline) decides.
    private _ignoreSceneDurationStop = false;
    constructor(canvas: HTMLCanvasElement, timingManager: any = null) {
        if (!canvas) throw new Error('Canvas element is required');
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2D context from canvas');
        this.ctx = ctx;
        this._setupImageLoadedListener();
        this.sceneBuilder.createDefaultMIDIScene();
        (window as any).vis = this; // debug helper
    }
    setIgnoreSceneDurationStop(v: boolean) {
        this._ignoreSceneDurationStop = !!v;
    }
    updateSceneElementTimingManager() {
        this.sceneBuilder.createDefaultMIDIScene();
    }
    play(): boolean {
        const hasGlobalEvents = this.events.length > 0;
        const hasElementEvents = this.getCurrentDuration() > 0;
        if (!hasGlobalEvents && !hasElementEvents) {
            // Ensure any stale playing flag is cleared
            this.isPlaying = false;
            return false;
        }
        this.isPlaying = true;
        const bufferTime = 0.5;
        this.startTime = performance.now() - (this.currentTime - bufferTime) * 1000;
        this.animate();
        return true;
    }
    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    stop() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        try {
            const { prePadding = 0 } = this.sceneBuilder.getSceneSettings();
            this.currentTime = -prePadding - 0.5;
        } catch {
            this.currentTime = -0.5;
        }
        this.startTime = 0;
        this.invalidateRender();
    }
    seek(time: number) {
        const bufferTime = 0.5;
        const currentDuration = this.getCurrentDuration();
        const { prePadding = 0 } = this.sceneBuilder.getSceneSettings();
        const minTime = -prePadding - bufferTime;
        if (this._ignoreSceneDurationStop) {
            this.currentTime = Math.max(minTime, time);
        } else {
            const maxTime = currentDuration + bufferTime;
            this.currentTime = Math.max(minTime, Math.min(time, maxTime));
        }
        if (this.isPlaying) this.startTime = performance.now() - (this.currentTime + 0.5) * 1000;
        this.invalidateRender();
    }
    getCurrentDuration() {
        const maxDuration = this.sceneBuilder.getMaxDuration();
        const base = maxDuration > 0 ? maxDuration : this.duration;
        const { prePadding = 0, postPadding = 0 } = this.sceneBuilder.getSceneSettings();
        return prePadding + base + postPadding;
    }
    updateExportSettings(settings: any) {
        const sceneKeys = ['fps', 'width', 'height', 'prePadding', 'postPadding'];
        const scenePartial: any = {};
        for (const k of sceneKeys) if (k in settings) scenePartial[k] = settings[k];
        if (Object.keys(scenePartial).length) {
            const before = this.sceneBuilder.getSceneSettings();
            const updated = this.sceneBuilder.updateSceneSettings(scenePartial);
            const fps = Math.max(1, (updated as any).fps || 30);
            this._rafMinIntervalMs = 1000 / fps;
            const widthChanged = 'width' in scenePartial && (before as any).width !== (updated as any).width;
            const heightChanged = 'height' in scenePartial && (before as any).height !== (updated as any).height;
            if ((widthChanged || heightChanged) && (updated as any).width && (updated as any).height)
                this.resize((updated as any).width, (updated as any).height);
        }
        const remaining = { ...settings };
        sceneKeys.forEach((k) => delete remaining[k]);
        this.exportSettings = { ...this.exportSettings, ...remaining };
        this.invalidateRender();
    }
    getExportSettings() {
        return { ...this.sceneBuilder.getSceneSettings(), ...this.exportSettings };
    }
    updateDebugSettings(settings: any) {
        this.debugSettings = { ...this.debugSettings, ...settings };
        this.invalidateRender();
    }
    getDebugSettings() {
        return { ...this.debugSettings };
    }
    stepForward() {
        const frameRate = this.sceneBuilder.getSceneSettings().fps;
        const step = 1 / frameRate;
        const currentDuration = this.getCurrentDuration();
        const newTime = Math.min(this.currentTime + step, currentDuration);
        this.seek(newTime);
    }
    stepBackward() {
        const frameRate = this.sceneBuilder.getSceneSettings().fps;
        const step = 1 / frameRate;
        const { prePadding = 0 } = this.sceneBuilder.getSceneSettings();
        const minTime = -prePadding;
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
            const currentDuration = this.getCurrentDuration();
            if (!this._ignoreSceneDurationStop) {
                if (this.currentTime >= currentDuration + bufferTime) {
                    this.stop();
                    return;
                }
            }
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
    renderAtTime(targetTime: number) {
        const config = this.getSceneConfig();
        const renderObjects = this.sceneBuilder.buildScene(config, targetTime);
        this.modularRenderer.render(this.ctx, renderObjects, config, targetTime);
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
        return this.sceneBuilder.buildScene(config, targetTime);
    }
    renderWithCustomObjects(customRenderObjects: any[], targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        const base = this.sceneBuilder.buildScene(config, targetTime);
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
        const sceneDuration = this.getCurrentDuration();
        return {
            canvas: this.canvas,
            duration: this.duration,
            sceneDuration,
            isPlaying: this.isPlaying,
            backgroundColor: '#000000',
            showAnchorPoints: this.debugSettings.showAnchorPoints,
            ...themeColors,
        };
    }
    getSceneBuilder() {
        return this.sceneBuilder;
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
        const elements = [...this.sceneBuilder.elements].filter((e: any) => e.visible);
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
        const { hoverElementId, selectedElementId, draggingElementId, activeHandle } = this._interactionState;
        if (!hoverElementId && !selectedElementId && !draggingElementId) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
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
    getTimelineService() {
        try {
            return (window as any).mvmntTimelineService;
        } catch {
            return undefined;
        }
    }
    addSceneElement(type: string, config: any = {}) {
        const element = this.sceneBuilder.addElementFromRegistry(type, config);
        if (element) this.invalidateRender();
        return element;
    }
    removeSceneElement(elementId: string) {
        const removed = this.sceneBuilder.removeElement(elementId);
        if (removed) this.invalidateRender();
        return removed;
    }
    updateSceneElementConfig(elementId: string, config: any) {
        const updated = this.sceneBuilder.updateElementConfig(elementId, config);
        if (updated) this.invalidateRender();
        return updated;
    }
    getSceneElementConfig(elementId: string) {
        return this.sceneBuilder.getElementConfig(elementId);
    }
    getSceneElements() {
        return this.sceneBuilder.getAllElements();
    }
    exportSceneConfig() {
        return this.sceneBuilder.serializeScene();
    }
    importSceneConfig(sceneData: any) {
        try {
            const src = sceneData?.sceneSettings;
            if (src) {
                this.updateExportSettings(src);
                try {
                    this.canvas?.dispatchEvent(
                        new CustomEvent('scene-imported', {
                            detail: { exportSettings: { ...this.getExportSettings() } },
                        })
                    );
                } catch {}
            }
            // Optional: seed timeline from sceneData.timeline if present
            const timelineSpec = (sceneData as any)?.timeline;
            const tl = this.getTimelineService();
            if (tl && timelineSpec && Array.isArray(timelineSpec.tracks)) {
                (async () => {
                    try {
                        tl.clearAllTracks();
                        // Only MIDI seed supported for now
                        for (const tr of timelineSpec.tracks) {
                            if (tr?.type === 'midi' && (tr.midiData || tr.file)) {
                                await tl.addMidiTrack({
                                    midiData: tr.midiData,
                                    file: tr.file,
                                    name: tr.name,
                                    offsetSec: tr.offsetSec || 0,
                                });
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to seed timeline from scene data:', e);
                    }
                })();
            }
        } catch (e) {
            console.warn('Failed applying scene settings', e);
        }
        const original = this._handleImageLoaded;
        const pendingImages: string[] = [];
        let batchLoadTimeout: any;
        this._handleImageLoaded = (event: any) => {
            if (event.detail?.imageSource) {
                pendingImages.push(event.detail.imageSource);
            }
            if (batchLoadTimeout) clearTimeout(batchLoadTimeout);
            batchLoadTimeout = setTimeout(() => {
                this._handleImageLoaded = original;
                this.invalidateRender();
            }, 100);
        };
        const loaded = this.sceneBuilder.loadScene(sceneData);
        if (loaded) {
            const imageElements: any[] = this.sceneBuilder.getElementsByType('image');
            if (imageElements.length > 0) {
                imageElements.forEach((el, idx) => {
                    const src = (el as any).imageSource;
                    if (src) {
                        setTimeout(() => {
                            (el as any).setImageSource(null);
                            setTimeout(() => {
                                (el as any).setImageSource(src);
                            }, 10);
                        }, idx * 20);
                    }
                });
            } else {
                this._handleImageLoaded = original;
                this.invalidateRender();
            }
        } else {
            this._handleImageLoaded = original;
        }
        return loaded;
    }
    resetToDefaultScene() {
        this.sceneBuilder.createDefaultMIDIScene();
        // Clear timeline tracks on reset
        try {
            this.getTimelineService()?.clearAllTracks?.();
        } catch {}
        const settings = this.sceneBuilder.getSceneSettings();
        try {
            this.canvas?.dispatchEvent(
                new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
            );
        } catch {}
        this.invalidateRender();
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
    }
    getSceneElement(elementId: string) {
        return this.sceneBuilder.getElement(elementId);
    }
    setSceneElementVisibility(elementId: string, visible: boolean) {
        const el: any = this.sceneBuilder.getElement(elementId);
        if (el) {
            el.setVisible(visible);
            this.invalidateRender();
        }
    }
    setSceneElementZIndex(elementId: string, zIndex: number) {
        const el: any = this.sceneBuilder.getElement(elementId);
        if (el) {
            el.setZIndex(zIndex);
            this.invalidateRender();
        }
    }
    moveSceneElement(elementId: string, newIndex: number) {
        if (this.sceneBuilder.moveElement(elementId, newIndex)) this.invalidateRender();
    }
    duplicateSceneElement(sourceId: string, newId: string) {
        const el = this.sceneBuilder.duplicateElement(sourceId, newId);
        if (el) this.invalidateRender();
        return el;
    }
}
