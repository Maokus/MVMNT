/* Scene Templates Module
 * Templates now emit serializable payloads that hydrate the scene store via the
 * store-driven command gateway.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAnimationSelectOptions } from '@animation/note-animations';
import { dispatchSceneCommand } from '@state/scene';
import type { SceneImportPayload, SceneSerializedElement, SceneSerializedMacros } from '@state/sceneStore';
import type { Macro } from '@state/scene/macros';
import type { PropertyBindingData } from '@bindings/property-bindings';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

const DEFAULT_SCENE_SETTINGS = { fps: 60, width: 1500, height: 1500, tempo: 120, beatsPerBar: 4 } as const;

function constant(value: unknown): PropertyBindingData {
    return { type: 'constant', value };
}

function macroBinding(macroId: string): PropertyBindingData {
    return { type: 'macro', macroId };
}

function isPropertyBindingData(value: unknown): value is PropertyBindingData {
    if (!value || typeof value !== 'object') return false;
    const type = (value as any).type;
    return type === 'constant' || type === 'macro';
}

function createElement(
    id: string,
    type: string,
    index: number,
    properties: Record<string, PropertyBindingData | string | number | boolean | null | undefined>
): SceneSerializedElement {
    const element: SceneSerializedElement = { id, type, index };
    for (const [key, raw] of Object.entries(properties)) {
        if (raw === undefined) continue;
        if (isPropertyBindingData(raw)) {
            element[key] = raw;
        } else {
            element[key] = constant(raw);
        }
    }
    return element;
}

function buildDefaultMacros(): SceneSerializedMacros {
    const now = Date.now();
    let options: { value: string; label: string }[] = [];
    try {
        options = getAnimationSelectOptions();
    } catch {
        options = [];
    }
    const normalizedOptions = [...options, { value: 'none', label: 'No Animation' }];
    const defaultAnimation =
        normalizedOptions.find((entry) => entry.value === 'expand')?.value || normalizedOptions[0]?.value || 'none';

    const midiTrackMacro: Macro = {
        name: 'midiTrack',
        type: 'midiTrackRef',
        value: null,
        defaultValue: null,
        options: {
            description:
                'ID of a MIDI track from the Timeline store. When set, all default scene elements will use this track.',
        },
        createdAt: now,
        lastModified: now,
    };

    const noteAnimationMacro: Macro = {
        name: 'noteAnimation',
        type: 'select',
        value: defaultAnimation,
        defaultValue: defaultAnimation,
        options: {
            selectOptions: normalizedOptions.map((entry) => ({ ...entry })),
            description: 'Note animation style',
        },
        createdAt: now,
        lastModified: now,
    };

    return {
        macros: {
            midiTrack: midiTrackMacro,
            noteAnimation: noteAnimationMacro,
        },
        exportedAt: now,
    };
}

function buildDefaultElements(): SceneSerializedElement[] {
    return [
        createElement('background', 'background', 0, {
            visible: true,
            zIndex: 0,
            anchorX: 0,
            anchorY: 0,
            offsetX: 0,
            offsetY: 0,
        }),
        createElement('main', 'timeUnitPianoRoll', 1, {
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
            midiTrackId: macroBinding('midiTrack'),
            animationType: macroBinding('noteAnimation'),
        }),
        createElement('timeDisplay', 'timeDisplay', 2, {
            zIndex: 40,
            anchorX: 0,
            anchorY: 1,
            offsetX: 100,
            offsetY: 1400,
            elementScaleX: 2.5,
            elementScaleY: 2.5,
        }),
        createElement('progressDisplay', 'progressDisplay', 3, {
            zIndex: 45,
            anchorX: 0,
            anchorY: 1,
            offsetX: 10,
            offsetY: 1490,
            barWidth: 1480,
        }),
        createElement('notesPlayedTracker', 'notesPlayedTracker', 4, {
            zIndex: 46,
            anchorX: 1,
            anchorY: 0,
            offsetX: 1400,
            offsetY: 100,
            textJustification: 'right',
            midiTrackId: macroBinding('midiTrack'),
        }),
        createElement('notesPlayingDisplay', 'notesPlayingDisplay', 5, {
            zIndex: 47,
            anchorX: 1,
            anchorY: 0,
            offsetX: 1400,
            offsetY: 180,
            textJustification: 'right',
            fontSize: 20,
            showAllAvailableTracks: true,
            elementOpacity: 0.5,
            midiTrackId: macroBinding('midiTrack'),
        }),
        createElement('chordEstimateDisplay', 'chordEstimateDisplay', 6, {
            zIndex: 48,
            anchorX: 1,
            anchorY: 1,
            offsetX: 1400,
            offsetY: 1400,
            midiTrackId: macroBinding('midiTrack'),
        }),
        createElement('textElement1', 'textOverlay', 7, {
            zIndex: 50,
            anchorX: 0,
            anchorY: 0,
            offsetX: 100,
            offsetY: 100,
            text: 'Song Title',
            fontSize: 100,
            fontFamily: 'Inter',
        }),
        createElement('textElement2', 'textOverlay', 8, {
            zIndex: 51,
            anchorX: 0,
            anchorY: 0,
            offsetX: 105,
            offsetY: 210,
            text: 'Artist Name',
            fontSize: 40,
            fontFamily: 'Inter | 100',
        }),
    ];
}

function applySceneTemplate(payload: SceneImportPayload, source: string): SceneImportPayload {
    dispatchSceneCommand({ type: 'loadSerializedScene', payload }, { source });
    return payload;
}

function createDefaultScenePayload(): SceneImportPayload {
    const macros = buildDefaultMacros();
    return {
        elements: buildDefaultElements(),
        sceneSettings: { ...DEFAULT_SCENE_SETTINGS },
        macros,
    };
}

export function createDebugScene(): SceneImportPayload {
    const payload = createDefaultScenePayload();
    const baseElements = payload.elements ?? [];
    const debugIndex = baseElements.length;
    const elements: SceneSerializedElement[] = [
        ...baseElements,
        createElement('debugOverlay', 'debug', debugIndex, {
            zIndex: 1000,
            anchorX: 0,
            anchorY: 0,
            offsetX: 10,
            offsetY: 10,
        }),
    ];
    return applySceneTemplate({ ...payload, elements }, 'scene-templates.createDebugScene');
}

export function createAllElementsDebugScene(): SceneImportPayload {
    const macros = buildDefaultMacros();
    const elements: SceneSerializedElement[] = [
        createElement('background', 'background', 0, {
            visible: true,
            zIndex: 0,
            anchorX: 0,
            anchorY: 0,
            offsetX: 0,
            offsetY: 0,
        }),
    ];

    const gridCols = 4;
    const cellW = 320;
    const cellH = 260;
    const startX = 160;
    const startY = 160;
    let index = 0;
    const usedIds = new Set<string>(['background']);

    const ensureId = (base: string) => {
        let id = base;
        let i = 1;
        while (usedIds.has(id)) id = `${base}_${i++}`;
        usedIds.add(id);
        return id;
    };

    const types = sceneElementRegistry
        .getAvailableTypes()
        .filter((type) => type !== 'background' && type !== 'debug');

    for (const type of types) {
        const baseId = type.replace(/[^a-zA-Z0-9]/g, '_');
        const id = ensureId(baseId || `element_${index}`);
        const col = index % gridCols;
        const row = Math.floor(index / gridCols);
        const offsetX = startX + col * cellW;
        const offsetY = startY + row * cellH;
        elements.push(
            createElement(id, type, elements.length, {
                zIndex: 10 + index * 2,
                anchorX: 0,
                anchorY: 0,
                offsetX,
                offsetY,
                midiTrackId: macroBinding('midiTrack'),
            })
        );
        index += 1;
    }

    elements.push(
        createElement('debugOverlay', 'debug', elements.length, {
            zIndex: 100000,
            anchorX: 0,
            anchorY: 0,
            offsetX: 10,
            offsetY: 10,
        })
    );

    const payload: SceneImportPayload = {
        elements,
        sceneSettings: { ...DEFAULT_SCENE_SETTINGS },
        macros,
    };

    return applySceneTemplate(payload, 'scene-templates.createAllElementsDebugScene');
}

export function createTestScene(): SceneImportPayload {
    const macros = buildDefaultMacros();
    const elements: SceneSerializedElement[] = [
        createElement('background', 'background', 0, { visible: true, zIndex: 0, anchorX: 0, anchorY: 0, offsetX: 0, offsetY: 0 }),
        createElement('main', 'timeUnitPianoRoll', 1, {
            zIndex: 10,
            timeUnitBars: 1,
            offsetX: 750,
            offsetY: 750,
            anchorX: 0.5,
            anchorY: 0.5,
            midiTrackId: macroBinding('midiTrack'),
        }),
        createElement('titleText', 'textOverlay', 2, {
            zIndex: 50,
            anchorX: 0,
            anchorY: 0,
            offsetX: 100,
            offsetY: 100,
            text: 'Text 1',
            fontSize: 100,
            fontFamily: 'Inter',
        }),
        createElement('artistText', 'textOverlay', 3, {
            zIndex: 51,
            anchorX: 0,
            anchorY: 0,
            offsetX: 105,
            offsetY: 210,
            text: 'Text 2',
            fontSize: 40,
            fontFamily: 'Inter | 100',
        }),
    ];

    const payload: SceneImportPayload = {
        elements,
        sceneSettings: { ...DEFAULT_SCENE_SETTINGS },
        macros,
    };

    return applySceneTemplate(payload, 'scene-templates.createTestScene');
}

