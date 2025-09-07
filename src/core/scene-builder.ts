/* Phase 1 TS migration - minimal typing; refine later */
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

export interface SceneSettings {
    fps: number;
    width: number;
    height: number;
    prePadding: number;
    postPadding: number;
    tempo?: number; // global BPM fallback when no tempo map
    beatsPerBar?: number; // global meter
}

export class HybridSceneBuilder {
    elements: SceneElement[] = [];
    elementRegistry = new Map<string, SceneElement>();
    sceneElementRegistry = sceneElementRegistry;
    private _defaultSceneSettings: SceneSettings = {
        fps: 30,
        width: 1500,
        height: 1500,
        prePadding: 0,
        postPadding: 0,
        tempo: 120,
        beatsPerBar: 4,
    };
    config: SceneSettings = { ...this._defaultSceneSettings };

    getSceneSettings(): SceneSettings {
        return { ...this.config };
    }
    updateSceneSettings(partial: Partial<SceneSettings> = {}) {
        this.config = { ...this.config, ...partial };
        // Synchronize global timing system (timeline store) if tempo/meter provided
        try {
            if (partial.tempo != null || partial.beatsPerBar != null) {
                // Lazy import to avoid cycles
                const { useTimelineStore } = require('@state/timelineStore');
                const st = useTimelineStore.getState();
                if (partial.tempo != null) st.setGlobalBpm(Math.max(1, Number(partial.tempo) || 120));
                if (partial.beatsPerBar != null) st.setBeatsPerBar(Math.max(1, Math.floor(partial.beatsPerBar || 4)));
            }
        } catch {}
        return this.getSceneSettings();
    }
    resetSceneSettings() {
        this.config = { ...this._defaultSceneSettings };
        // Also reset global timing to defaults
        try {
            const { useTimelineStore } = require('@state/timelineStore');
            const st = useTimelineStore.getState();
            if (this._defaultSceneSettings.tempo != null) st.setGlobalBpm(this._defaultSceneSettings.tempo);
            if (this._defaultSceneSettings.beatsPerBar != null)
                st.setBeatsPerBar(this._defaultSceneSettings.beatsPerBar);
        } catch {}
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
        return this;
    }
    clearScene() {
        return this.clearElements();
    }
    getMaxDuration() {
        let max = 0;
        // Legacy elements duration
        for (const el of this.elements) {
            const dur = (el as any).midiManager?.getDuration?.();
            if (typeof dur === 'number' && dur > max) max = dur;
        }
        // New timeline store-based duration
        try {
            // Lazy import to avoid cyclic deps at module load
            const { useTimelineStore } = require('@state/timelineStore');
            const state = useTimelineStore.getState();
            for (const id of state.tracksOrder) {
                const t = state.tracks[id];
                if (!t || t.type !== 'midi' || !t.enabled) continue;
                const cache = state.midiCache[t.midiSourceId ?? id];
                if (!cache || !cache.notesRaw || cache.notesRaw.length === 0) continue;
                const localEnd = cache.notesRaw.reduce((m: number, n: any) => Math.max(m, n.endTime || 0), 0);
                let end = localEnd;
                if (typeof t.regionEndSec === 'number') end = Math.min(end, t.regionEndSec);
                // If regionStart beyond end, skip
                if (typeof t.regionStartSec === 'number') end = Math.max(end, t.regionStartSec);
                const timelineEnd = (t.offsetSec || 0) + end;
                if (timelineEnd > max) max = timelineEnd;
            }
        } catch {}
        return max;
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
        this.createDefaultMIDIScene();
        this.addElement(new DebugElement('debugOverlay', { zIndex: 1000, anchorX: 0, anchorY: 0 }));
    }
    createDefaultMIDIScene() {
        this.clearElements();
        this.resetSceneSettings();
        this._createDefaultMacros();
        this.addElement(new BackgroundElement('background', { zIndex: 0, anchorX: 0, anchorY: 0 }));
        this.addElement(
            new TimeUnitPianoRollElement('main', {
                zIndex: 10,
                timeUnitBars: 1,
                offsetX: 750,
                offsetY: 750,
                anchorX: 0.5,
                anchorY: 0.5,
                showNoteGrid: false,
                showBeatGrid: false,
                showNoteLabels: false,
                showBeatLabels: false,
            })
        );
        this.addElement(
            new TimeDisplayElement('timeDisplay', {
                zIndex: 40,
                anchorX: 0,
                anchorY: 1,
                offsetX: 100,
                offsetY: 1400,
                elementScaleX: 2.5,
                elementScaleY: 2.5,
            })
        );
        this.addElement(
            new ProgressDisplayElement('progressDisplay', {
                zIndex: 45,
                anchorX: 0,
                anchorY: 1,
                offsetX: 10,
                offsetY: 1490,
                barWidth: 1480,
            })
        );
        this.addElement(
            new NotesPlayedTrackerElement('notesPlayedTracker', {
                zIndex: 46,
                anchorX: 1,
                anchorY: 0,
                offsetX: 1400,
                offsetY: 100,
                textJustification: 'right',
            })
        );
        this.addElement(
            new NotesPlayingDisplayElement('notesPlayingDisplay', {
                zIndex: 47,
                anchorX: 1,
                anchorY: 0,
                offsetX: 1400,
                offsetY: 180,
                textJustification: 'right',
                fontSize: 20,
                showAllAvailableTracks: true,
                elementOpacity: 0.5,
            })
        );
        this.addElement(
            new ChordEstimateDisplayElement('chordEstimateDisplay', {
                zIndex: 48,
                anchorX: 1,
                anchorY: 1,
                offsetX: 1400,
                offsetY: 1400,
            })
        );
        this.addElement(
            new TextOverlayElement('textElement1', {
                zIndex: 50,
                anchorX: 0,
                anchorY: 0,
                offsetX: 100,
                offsetY: 100,
                text: 'Song Title',
                fontSize: 100,
                fontFamily: 'Inter',
            })
        );
        this.addElement(
            new TextOverlayElement('textElement2', {
                zIndex: 51,
                anchorX: 0,
                anchorY: 0,
                offsetX: 105,
                offsetY: 210,
                text: 'Artist Name',
                fontSize: 40,
                fontWeight: 'normal',
                fontFamily: 'Inter | 100',
            })
        );
        this._assignDefaultMacros();
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
                    offsetSec: t.offsetSec || 0,
                    // Do not serialize full midiData by default to keep files small
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
                if (typeof src.prePadding === 'number') partial.prePadding = src.prePadding;
                if (typeof src.postPadding === 'number') partial.postPadding = src.postPadding;
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
        globalMacroManager.createMacro('tempo', 'number', 120, { min: 20, max: 300, step: 0.1, description: 'BPM' });
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
        // No-op: legacy per-element timing bindings removed in favor of global timeline tempo
    }
    createTestScene() {
        this.clearElements();
        this._createDefaultMacros();
        this.addElement(new BackgroundElement('background'));
        this.addElement(
            new TimeUnitPianoRollElement('main', {
                zIndex: 10,
                timeUnitBars: 1,
                offsetX: 750,
                offsetY: 750,
                anchorX: 0.5,
                anchorY: 0.5,
            })
        );
        this.addElement(
            new TextOverlayElement('titleText', {
                zIndex: 50,
                anchorX: 0,
                anchorY: 0,
                offsetX: 100,
                offsetY: 100,
                text: 'Text 1',
                fontSize: 100,
                fontWeight: 'bold',
            })
        );
        this.addElement(
            new TextOverlayElement('artistText', {
                zIndex: 51,
                anchorX: 0,
                anchorY: 0,
                offsetX: 105,
                offsetY: 210,
                text: 'Text 2',
                fontSize: 40,
                fontWeight: 'normal',
            })
        );
        this.autoBindElements();
        return this;
    }
}
