/* Scene Templates Module
 * Centralizes construction of scene element templates to keep HybridSceneBuilder lean.
 * Each template function accepts a HybridSceneBuilder instance and mutates it accordingly.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HybridSceneBuilder } from './scene-builder';
import {
    BackgroundElement,
    TimeDisplayElement,
    TextOverlayElement,
    ProgressDisplayElement,
    TimeUnitPianoRollElement,
    DebugElement,
    NotesPlayedTrackerElement,
    NotesPlayingDisplayElement,
    ChordEstimateDisplayElement,
    SceneElement,
} from '@core/scene/elements';
import { globalMacroManager } from '@bindings/macro-manager';
import { getAnimationSelectOptions } from '@animation/note-animations';
import { useTimelineStore } from '@state/timelineStore';
import { synchronizeSceneStoreFromBuilder } from '@state/scene';

// Helper to (re)create default macros (mirrors private builder logic)
function createDefaultMacros() {
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
        console.warn('[scene-templates] Failed animation macro init', e);
    }
}

function assignDefaultMacros(builder: HybridSceneBuilder) {
    const pianoRoll: any = builder.getElementsByType('timeUnitPianoRoll')[0];
    const notesPlayingDisplay: any = builder.getElementsByType('notesPlayingDisplay')[0];
    const playedNotesTracker: any = builder.getElementsByType('notesPlayedTracker')[0];
    const chordEstimateDisplay: any = builder.getElementsByType('chordEstimateDisplay')[0];
    try {
        pianoRoll?.bindToMacro('animationType', 'noteAnimation');
    } catch {}
    pianoRoll?.bindToMacro?.('midiTrackId', 'midiTrack');
    notesPlayingDisplay?.bindToMacro?.('midiTrackId', 'midiTrack');
    playedNotesTracker?.bindToMacro?.('midiTrackId', 'midiTrack');
    chordEstimateDisplay?.bindToMacro?.('midiTrackId', 'midiTrack');
}

export function createDefaultMIDIScene(builder: HybridSceneBuilder) {
    builder.clearElements();
    builder.resetSceneSettings();
    createDefaultMacros();
    builder.addElement(new BackgroundElement('background', { zIndex: 0, anchorX: 0, anchorY: 0 }));
    builder.addElement(
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
    builder.addElement(
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
    builder.addElement(
        new ProgressDisplayElement('progressDisplay', {
            zIndex: 45,
            anchorX: 0,
            anchorY: 1,
            offsetX: 10,
            offsetY: 1490,
            barWidth: 1480,
        })
    );
    builder.addElement(
        new NotesPlayedTrackerElement('notesPlayedTracker', {
            zIndex: 46,
            anchorX: 1,
            anchorY: 0,
            offsetX: 1400,
            offsetY: 100,
            textJustification: 'right',
        })
    );
    builder.addElement(
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
    builder.addElement(
        new ChordEstimateDisplayElement('chordEstimateDisplay', {
            zIndex: 48,
            anchorX: 1,
            anchorY: 1,
            offsetX: 1400,
            offsetY: 1400,
        })
    );
    builder.addElement(
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
    builder.addElement(
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
    assignDefaultMacros(builder);
    return builder;
}

export function createDebugScene(builder: HybridSceneBuilder) {
    // Mirror old implementation: start from default scene then adjust
    createDefaultMIDIScene(builder);
    try {
        globalMacroManager.deleteMacro('noteAnimation');
    } catch {}
    builder.addElement(new DebugElement('debugOverlay', { zIndex: 1000, anchorX: 0, anchorY: 0 }));
    return builder;
}

export function createAllElementsDebugScene(builder: HybridSceneBuilder) {
    builder.clearElements();
    builder.resetSceneSettings();
    createDefaultMacros();
    try {
        globalMacroManager.deleteMacro('noteAnimation');
    } catch {}
    const types = (builder.sceneElementRegistry as any).getAvailableTypes?.() || [];
    const usedIds = new Set<string>();
    const ensureId = (base: string) => {
        let id = base;
        let i = 1;
        while (usedIds.has(id)) id = base + '_' + i++;
        usedIds.add(id);
        return id;
    };
    builder.addElement(new BackgroundElement('background', { zIndex: 0, anchorX: 0, anchorY: 0 }));
    const gridCols = 4;
    const cellW = 320;
    const cellH = 260;
    const startX = 160;
    const startY = 160;
    let index = 0;
    let zBase = 10;
    const trackPropCandidates = ['midiTrackId', 'trackId', 'sourceTrackId'];
    for (const t of types) {
        if (t === 'background' || t === 'debug') continue;
        try {
            const baseId = t.replace(/[^a-zA-Z0-9]/g, '_');
            const id = ensureId(baseId);
            const col = index % gridCols;
            const row = Math.floor(index / gridCols);
            const offsetX = startX + col * cellW;
            const offsetY = startY + row * cellH;
            const el: any = builder.addElementFromRegistry(t, {
                id,
                zIndex: zBase + index * 2,
                anchorX: 0,
                anchorY: 0,
                offsetX,
                offsetY,
            });
            if (el?.bindToMacro) {
                for (const cand of trackPropCandidates) {
                    if (cand in el) {
                        try {
                            el.bindToMacro(cand, 'midiTrack');
                        } catch {}
                    }
                }
            }
            index++;
        } catch (e) {
            console.warn('[scene-templates] Failed to add element type', t, e);
        }
    }
    builder.addElement(
        new DebugElement('debugOverlay', { zIndex: 100000, anchorX: 0, anchorY: 0, offsetX: 10, offsetY: 10 })
    );
    return builder;
}

export function createTestScene(builder: HybridSceneBuilder) {
    builder.clearElements();
    createDefaultMacros();
    builder.addElement(new BackgroundElement('background'));
    builder.addElement(
        new TimeUnitPianoRollElement('main', {
            zIndex: 10,
            timeUnitBars: 1,
            offsetX: 750,
            offsetY: 750,
            anchorX: 0.5,
            anchorY: 0.5,
        })
    );
    builder.addElement(
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
    builder.addElement(
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
    return builder;
}

// Resets scene to default + clears timeline tracks (moved from visualizer-core.resetToDefaultScene)
export function resetToDefaultScene(visualizer: any) {
    const builder: HybridSceneBuilder = visualizer.getSceneBuilder?.();
    if (!builder) return;
    createDefaultMIDIScene(builder);
    // Clear timeline tracks on reset (side effect intentionally centralized here now)
    try {
        useTimelineStore.getState().clearAllTracks();
    } catch {}
    synchronizeSceneStoreFromBuilder(builder, { source: 'scene-templates.resetToDefaultScene' });
    const settings = builder.getSceneSettings();
    try {
        visualizer.canvas?.dispatchEvent(
            new CustomEvent('scene-imported', { detail: { exportSettings: { ...settings } } })
        );
    } catch {}
    visualizer.invalidateRender?.();
}
