/* Minimal typing; refine later */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    BackgroundElement,
    TimeDisplayElement,
    TextOverlayElement,
    ProgressDisplayElement,
    TimeUnitPianoRollElement,
    DebugElement,
    SceneElement,
    NotesPlayedTrackerElement,
    NotesPlayingDisplayElement,
    ChordEstimateDisplayElement,
} from '@core/scene/elements';
import { globalMacroManager } from '@bindings/macro-manager';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';
import { getAnimationSelectOptions } from '@animation/note-animations';
// NOTE: SceneBuilder must not WRITE to the timeline store. It may read for derived info (e.g. duration).
// We deliberately only import read helpers. Do NOT call mutation actions here; mutations are centralized
// in the DocumentGateway (persistence layer) per architectural refactor.
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';

export interface SceneSettings {
    fps: number;
    width: number;
    height: number;
    tempo?: number; // global BPM fallback when no tempo map
    beatsPerBar?: number; // global meter
}

export class HybridSceneBuilder {
    elements: SceneElement[] = [];
    elementRegistry = new Map<string, SceneElement>();
    sceneElementRegistry = sceneElementRegistry;
    private _defaultSceneSettings: SceneSettings = {
        fps: 60, // updated default framerate
        width: 1500,
        height: 1500,
        tempo: 120,
        beatsPerBar: 4,
    };
    config: SceneSettings = { ...this._defaultSceneSettings };
    // Optimization #5: cache max duration until invalidated
    private _cachedMaxDurationSec: number | null = null;
    private _cachedSignature: string | null = null; // signature of elements + tracks/tempo influencing duration
    private _unsubStore?: () => void;

    constructor() {
        // Subscribe to timeline store to invalidate cache when track regions / tempo context change
        try {
            this._unsubStore = useTimelineStore.subscribe((s, prev) => {
                if (
                    s.timeline.globalBpm !== prev.timeline.globalBpm ||
                    (s.timeline.masterTempoMap?.length || 0) !== (prev.timeline.masterTempoMap?.length || 0) ||
                    s.tracksOrder !== prev.tracksOrder ||
                    s.tracks !== prev.tracks
                ) {
                    this._invalidateDurationCache();
                }
            });
        } catch {
            /* ignore subscription errors (e.g., during SSR/tests) */
        }
    }

    private _invalidateDurationCache() {
        this._cachedMaxDurationSec = null;
        this._cachedSignature = null;
    }

    getSceneSettings(): SceneSettings {
        return { ...this.config };
    }
    updateSceneSettings(partial: Partial<SceneSettings> = {}) {
        // Pure configuration update (no store writes). Tempo / meter synchronization is now handled
        // by DocumentGateway when applying documents or other higher-level orchestrators.
        this.config = { ...this.config, ...partial };
        return this.getSceneSettings();
    }
    resetSceneSettings() {
        // Pure reset (no store writes). Upstream layers may decide whether timeline store should also reset.
        this.config = { ...this._defaultSceneSettings };
        return this.getSceneSettings();
    }

    addElement(elementOrType: SceneElement | string, id?: string, config?: any): SceneElement | boolean {
        if (typeof elementOrType === 'string') {
            const el = this.addElementFromRegistry(elementOrType, { id, ...config });
            return !!el;
        }
        const element = elementOrType;
        this.elements.push(element);
        if ((element as any).id) this.elementRegistry.set((element as any).id, element);
        this._invalidateDurationCache();
        return element;
    }
    removeElement(id: string) {
        const el = this.elementRegistry.get(id);
        if (!el) return false;
        const idx = this.elements.indexOf(el);
        if (idx !== -1) {
            try {
                (el as any).dispose?.();
            } catch {}
            this.elements.splice(idx, 1);
        }
        this.elementRegistry.delete(id);
        this._invalidateDurationCache();
        return true;
    }
    getElement(id: string) {
        return this.elementRegistry.get(id);
    }
    updateElementId(oldId: string, newId: string) {
        const el = this.elementRegistry.get(oldId);
        if (!el) return false;
        if (this.elementRegistry.has(newId) && newId !== oldId) return false;
        (el as any).id = newId;
        this.elementRegistry.delete(oldId);
        this.elementRegistry.set(newId, el);
        return true;
    }
    clearElements() {
        for (const el of this.elements) {
            try {
                (el as any).dispose?.();
            } catch {}
        }
        this.elements = [];
        this.elementRegistry.clear();
        this.resetSceneSettings();
        this._invalidateDurationCache();
        return this;
    }
    clearScene() {
        return this.clearElements();
    }
    getMaxDuration() {
        // Build signature: element count + each element id + track order length + bpm + tempo map length
        try {
            const state = useTimelineStore.getState();
            const elIds = this.elements.map((e: any) => e.id || '').join('|');
            const trackSig = state.tracksOrder.join(',');
            const bpm = state.timeline.globalBpm || 120;
            const tempoLen = state.timeline.masterTempoMap?.length || 0;
            const signature = `${elIds}::${trackSig}::${bpm}::${tempoLen}`;
            if (this._cachedSignature === signature && this._cachedMaxDurationSec != null) {
                return this._cachedMaxDurationSec;
            }
            let max = 0;
            for (const el of this.elements) {
                const dur = (el as any).midiManager?.getDuration?.();
                if (typeof dur === 'number' && dur > max) max = dur;
            }
            const tm = getSharedTimingManager();
            tm.setBPM(bpm);
            if (state.timeline.masterTempoMap) tm.setTempoMap(state.timeline.masterTempoMap, 'seconds');
            for (const id of state.tracksOrder) {
                const t: any = (state as any).tracks[id];
                if (!t || t.type !== 'midi' || !t.enabled) continue;
                const cache = (state as any).midiCache[t.midiSourceId ?? id];
                if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
                const regionStartTick = t.regionStartTick ?? 0;
                const regionEndTick = t.regionEndTick ?? Number.POSITIVE_INFINITY;
                let maxEndTick = 0;
                for (const n of cache.notesRaw) {
                    if (n.endTick <= regionStartTick || n.startTick >= regionEndTick) continue;
                    const clippedEnd = Math.min(n.endTick, regionEndTick);
                    if (clippedEnd > maxEndTick) maxEndTick = clippedEnd;
                }
                const trackEndTick = maxEndTick + t.offsetTicks;
                if (trackEndTick <= 0) continue;
                const endBeats = trackEndTick / tm.ticksPerQuarter;
                const endSec = tm.beatsToSeconds(endBeats);
                if (endSec > max) max = endSec;
            }
            this._cachedMaxDurationSec = max;
            this._cachedSignature = signature;
            return max;
        } catch {
            return this._cachedMaxDurationSec ?? 0;
        }
    }
    getAllElements() {
        return [...this.elements];
    }
    getAllMacroAssignments(macroId: string | null = null) {
        const assign: any[] = [];
        for (const el of this.elements) {
            if (el instanceof SceneElement) {
                if (macroId) {
                    const paths = (el as any).getMacroBindingsForMacro(macroId);
                    for (const p of paths) assign.push({ elementId: (el as any).id, propertyPath: p, macroId });
                } else {
                    const bindings = (el as any).getBindingsByType('macro');
                    for (const { propertyPath, binding } of bindings)
                        assign.push({ elementId: (el as any).id, propertyPath, macroId: binding.getMacroId() });
                }
            }
        }
        return assign;
    }
    setElements(elements: SceneElement[]) {
        this.clearElements();
        elements.forEach((e) => this.addElement(e));
        return this;
    }
    buildScene(config: any, targetTime: number) {
        const ros: any[] = [];
        const sorted = [...this.elements]
            .filter((e) => (e as any).visible)
            .sort((a, b) => (a as any).zIndex - (b as any).zIndex);
        for (const el of sorted) {
            try {
                const r = (el as any).buildRenderObjects(config, targetTime);
                if (Array.isArray(r)) ros.push(...r);
            } catch (e) {
                console.warn('Error building render objects for', (el as any).id || (el as any).type, e);
            }
        }
        return ros;
    }
    buildSceneWithElements(config: any, targetTime: number, custom: SceneElement[]) {
        const ros: any[] = [];
        const sorted = [...custom]
            .filter((e) => (e as any).visible)
            .sort((a, b) => (a as any).zIndex - (b as any).zIndex);
        for (const el of sorted) {
            try {
                const r = (el as any).buildRenderObjects(config, targetTime);
                if (Array.isArray(r)) ros.push(...r);
            } catch (e) {}
        }
        return ros;
    }
    getElementsByType(type: string) {
        return this.elements.filter((e) => (e as any).type === type);
    }
    createDebugScene() {
        console.warn('[HybridSceneBuilder] createDebugScene deprecated. Use scene-templates.createDebugScene(builder)');
    }
    /**
     * Create a debug scene containing every registered scene element type once.
     * Uses registry schemas to generate ids and applies minimal default config.
     * This helps visually QA layout / property panels.
     */
    createAllElementsDebugScene() {
        console.warn(
            '[HybridSceneBuilder] createAllElementsDebugScene deprecated. Use scene-templates.createAllElementsDebugScene(builder)'
        );
        return this;
    }
    createDefaultMIDIScene() {
        console.warn(
            '[HybridSceneBuilder] createDefaultMIDIScene deprecated. Use scene-templates.createDefaultMIDIScene(builder)'
        );
        return this;
    }
    addElementFromRegistry(type: string, config: any = {}) {
        const el = this.sceneElementRegistry.createElement(type, config);
        if (el) {
            this.addElement(el as any);
            return el;
        }
        return null;
    }
    updateElementConfig(id: string, newConfig: any) {
        const el: any = this.getElement(id);
        if (!el) return false;
        if (el instanceof SceneElement) {
            el.updateConfig(newConfig);
            return true;
        }
        console.warn('[updateElementConfig] Element not SceneElement');
        return false;
    }
    getElementConfig(id: string) {
        const el: any = this.getElement(id);
        if (!el) return null;
        if (el instanceof SceneElement) return el.getConfig();
        const schema: any = this.sceneElementRegistry.getSchema(el.type);
        const cfg: any = { id: el.id, type: el.type, visible: el.visible, zIndex: el.zIndex };
        if (schema?.properties) {
            for (const [k, ps] of Object.entries<any>(schema.properties)) {
                if (k === 'id' || k === 'type') continue;
                if (k in el && el[k] !== undefined) cfg[k] = el[k];
                else if (ps.default !== undefined) cfg[k] = ps.default;
            }
        }
        return cfg;
    }
    moveElement(id: string, newIndex: number) {
        const el = this.getElement(id);
        if (!el) return false;
        const current = this.elements.indexOf(el);
        if (current === -1) return false;
        this.elements.splice(current, 1);
        const clamped = Math.max(0, Math.min(newIndex, this.elements.length));
        this.elements.splice(clamped, 0, el);
        return true;
    }
    duplicateElement(sourceId: string, newId: string) {
        const src = this.getElement(sourceId);
        if (!src) return null;
        const cfg: any = this.getElementConfig(sourceId);
        if (!cfg) return null;
        cfg.id = newId;
        return this.addElementFromRegistry((src as any).type, cfg);
    }
    serializeScene() {
        const serialized = this.elements.map((el) => {
            if (el instanceof SceneElement) return { ...el.getSerializableConfig(), index: this.elements.indexOf(el) };
            throw new Error('[serializeScene] Element not SceneElement');
        });
        const macroData = globalMacroManager.exportMacros();
        let version: any;
        try {
            version = (import.meta as any).env.VITE_VERSION || (import.meta as any).env.REACT_APP_VERSION;
        } catch {}
        if (!version && typeof process !== 'undefined') version = (process as any).env?.REACT_APP_VERSION;
        let bindingVersion: any;
        try {
            bindingVersion =
                (import.meta as any).env.VITE_BINDING_VERSION || (import.meta as any).env.REACT_APP_BINDING_VERSION;
        } catch {}
        if (!bindingVersion && typeof process !== 'undefined')
            bindingVersion = (process as any).env?.REACT_APP_BINDING_VERSION;
        // Optional: include a minimal timeline spec if available via window service
        let timeline: any = undefined;
        try {
            const tl = (window as any).mvmntTimelineService;
            if (tl && typeof tl.getTracks === 'function') {
                const tracks = tl.getTracks()?.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    type: t.type,
                    offsetTicks: t.offsetTicks || 0,
                }));
                timeline = { tracks };
            }
        } catch {}
        return {
            version,
            elements: serialized,
            macros: macroData,
            serializedAt: new Date().toISOString(),
            bindingSystemVersion: bindingVersion,
            sceneSettings: { ...this.config },
            timeline,
        };
    }
    loadScene(sceneData: any) {
        if (!sceneData || !sceneData.elements) {
            console.error('Invalid scene data');
            return false;
        }
        try {
            this.clearElements();
            const src = sceneData.sceneSettings;
            if (src) {
                const partial: any = {};
                if (typeof src.fps === 'number') partial.fps = src.fps;
                if (typeof src.width === 'number') partial.width = src.width;
                if (typeof src.height === 'number') partial.height = src.height;
                if (typeof src.tempo === 'number') partial.tempo = src.tempo;
                if (typeof src.beatsPerBar === 'number') partial.beatsPerBar = src.beatsPerBar;
                this.updateSceneSettings(partial);
            } else this.resetSceneSettings();
            if (sceneData.macros) globalMacroManager.importMacros(sceneData.macros);
            else this._createDefaultMacros();
            const hasBindingSystem = sceneData.bindingSystemVersion !== undefined;
            const sorted = sceneData.elements.sort((a: any, b: any) => (a.index || 0) - (b.index || 0));
            for (const ec of sorted) {
                if (!ec.type || !ec.id) {
                    console.warn('Skipping invalid element', ec);
                    continue;
                }
                const el = this.addElementFromRegistry(ec.type, ec);
                if (el) {
                    if (ec.visible !== undefined && typeof ec.visible === 'boolean') (el as any).setVisible(ec.visible);
                    // Only apply zIndex directly if it's a primitive number (not a serialized binding object)
                    if (ec.zIndex !== undefined) {
                        const zRaw = ec.zIndex;
                        if (typeof zRaw === 'number' && isFinite(zRaw)) {
                            (el as any).setZIndex(zRaw);
                        } else if (zRaw && typeof zRaw === 'object' && zRaw.type) {
                            // Already handled via constructor _applyConfig; do nothing.
                        } else {
                            // Fallback: coerce to 0
                            (el as any).setZIndex(0);
                        }
                    }
                }
            }
            console.log(`Scene loaded: ${sorted.length} elements, binding system: ${hasBindingSystem ? 'yes' : 'no'}`);
            return true;
        } catch (e) {
            console.error('Error loading scene', e);
            return false;
        }
    }
    _createDefaultMacros() {
        // Global MIDI track selector macro controls scene elements' MIDI source
        globalMacroManager.createMacro('midiTrack', 'midiTrackRef', null, {
            description:
                'ID of a MIDI track from the Timeline store. When set, all default scene elements will use this track.',
        });
        try {
            const options = [...getAnimationSelectOptions(), { value: 'none', label: 'No Animation' }];
            const def = options.find((o) => o.value === 'expand')?.value || (options[0] && options[0].value) || 'none';
            globalMacroManager.createMacro('noteAnimation', 'select', def, {
                selectOptions: options,
                description: 'Note animation style',
            });
        } catch (e) {
            console.warn('Failed animation macro init', e);
        }
    }
    _assignDefaultMacros() {
        const pianoRoll: any = this.getElementsByType('timeUnitPianoRoll')[0];
        const timeDisplay: any = this.getElementsByType('timeDisplay')[0];
        const notesPlayingDisplay: any = this.getElementsByType('notesPlayingDisplay')[0];
        const playedNotesTracker: any = this.getElementsByType('notesPlayedTracker')[0];
        const chordEstimateDisplay: any = this.getElementsByType('chordEstimateDisplay')[0];
        // No per-element timing bindings; elements read global tempo/meter from the Timeline store
        try {
            pianoRoll?.bindToMacro('animationType', 'noteAnimation');
        } catch {}
        // Bind MIDI track selection across default elements to a single macro
        pianoRoll?.bindToMacro?.('midiTrackId', 'midiTrack');
        notesPlayingDisplay?.bindToMacro?.('midiTrackId', 'midiTrack');
        playedNotesTracker?.bindToMacro?.('midiTrackId', 'midiTrack');
        chordEstimateDisplay?.bindToMacro?.('midiTrackId', 'midiTrack');
    }
    autoBindElements() {
        // No-op: per-element timing bindings removed in favor of global timeline tempo
    }
    createTestScene() {
        console.warn('[HybridSceneBuilder] createTestScene deprecated. Use scene-templates.createTestScene(builder)');
        return this;
    }
}
