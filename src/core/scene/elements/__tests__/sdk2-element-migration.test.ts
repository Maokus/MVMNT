import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as elements from '..';
import { audioReactive } from '../_templates/audio-reactive';
import { basicShape } from '../_templates/basic-shape';
import { bundledImage } from '../_templates/bundled-image';
import { gridAtlas } from '../_templates/grid-atlas';
import { atlasImage } from '../_templates/image-atlas';
import { simpleImage } from '../_templates/image-simple';
import { midiNotes } from '../_templates/midi-notes';
import { minimal } from '../_templates/minimal';
import { textDisplay } from '../_templates/text-display';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

const builtIns = [
    elements.background,
    elements.basicShapes,
    elements.image,
    elements.progressDisplay,
    elements.textOverlay,
    elements.timeDisplay,
    elements.timeUnitPianoRoll,
    elements.movingNotesPianoRoll,
    elements.notesPlayedTracker,
    elements.notesPlayingDisplay,
    elements.chordEstimateDisplay,
    elements.ccMonitor,
    elements.audioSpectrum,
    elements.audioVolumeMeter,
    elements.audioWaveform,
    elements.audioPeaks,
    elements.audioLockedOscilloscope,
    elements.debug,
];

describe('SDK 2 element migration inventory', () => {
    it('registers every shipped built-in through a canonical definition', () => {
        expect(builtIns.map((definition) => definition.kind)).toEqual(
            new Array(builtIns.length).fill('mvmnt.plugin-element.v2')
        );
        expect(builtIns.map((definition) => definition.type)).toEqual(sceneElementRegistry.getBuiltInTypes());
    });

    it('keeps every authoring template on definition/context APIs only', () => {
        const templates = [
            audioReactive,
            basicShape,
            bundledImage,
            gridAtlas,
            atlasImage,
            simpleImage,
            midiNotes,
            minimal,
            textDisplay,
        ];
        expect(templates.every((definition) => definition.kind === 'mvmnt.plugin-element.v2')).toBe(true);

        for (const filename of [
            'audio-reactive.ts',
            'basic-shape.ts',
            'bundled-image.ts',
            'grid-atlas.ts',
            'image-atlas.ts',
            'image-simple.ts',
            'midi-notes.ts',
            'minimal.ts',
            'text-display.ts',
        ]) {
            const source = readFileSync(resolve(process.cwd(), 'src/core/scene/elements/_templates', filename), 'utf8');
            expect(source).not.toMatch(/\bSceneElement\b|\bgetRequiredPluginApi\b|\bgetPluginHostApi\b|\bprop\./);
        }
    });

    it('renders timeline built-ins without relying on the public plugin global', () => {
        const previousMvmnt = (globalThis as any).MVMNT;
        (globalThis as any).MVMNT = undefined;
        try {
            const notesDisplay = sceneElementRegistry.createElement('notesPlayingDisplay', { id: 'notes' });
            const noteTracker = sceneElementRegistry.createElement('notesPlayedTracker', { id: 'tracker' });

            expect(() => notesDisplay.buildRenderObjects({}, 0)).not.toThrow();
            expect(() => noteTracker.buildRenderObjects({}, 0)).not.toThrow();
        } finally {
            (globalThis as any).MVMNT = previousMvmnt;
        }
    });
});
