import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtInCatalog } from '../catalog';
import { audioReactive } from '@core/scene/authoring/templates/audio-reactive';
import { basicShape } from '@core/scene/authoring/templates/basic-shape';
import { bundledImage } from '@core/scene/authoring/templates/bundled-image';
import { gridAtlas } from '@core/scene/authoring/templates/grid-atlas';
import { atlasImage } from '@core/scene/authoring/templates/image-atlas';
import { simpleImage } from '@core/scene/authoring/templates/image-simple';
import { midiNotes } from '@core/scene/authoring/templates/midi-notes';
import { minimal } from '@core/scene/authoring/templates/minimal';
import { textDisplay } from '@core/scene/authoring/templates/text-display';
import { sceneElementRegistry } from '@core/scene/registry';

describe('SDK 2 element migration inventory', () => {
    it('registers every shipped built-in through a canonical definition', () => {
        expect(builtInCatalog.map(({ definition }) => definition.kind)).toEqual(
            new Array(builtInCatalog.length).fill('mvmnt.plugin-element.v2')
        );
        expect(builtInCatalog.map(({ definition }) => definition.type)).toEqual(sceneElementRegistry.getBuiltInTypes());
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
            const source = readFileSync(resolve(process.cwd(), 'src/core/scene/authoring/templates', filename), 'utf8');
            expect(source).not.toMatch(/\bSceneElement\b|\bgetRequiredPluginApi\b|\bgetPluginHostApi\b|\bprop\./);
        }
    });

    it('renders timeline built-ins without relying on the public plugin global', () => {
        const previousMvmnt = (globalThis as any).MVMNT;
        (globalThis as any).MVMNT = undefined;
        try {
            const notesDisplay = sceneElementRegistry.createElement('notesPlayingDisplay', { id: 'notes' });
            const noteTracker = sceneElementRegistry.createElement('notesPlayedTracker', { id: 'tracker' });

            expect(notesDisplay).not.toBeNull();
            expect(noteTracker).not.toBeNull();
            expect(() => notesDisplay?.buildRenderObjects({}, 0)).not.toThrow();
            expect(() => noteTracker?.buildRenderObjects({}, 0)).not.toThrow();
        } finally {
            (globalThis as any).MVMNT = previousMvmnt;
        }
    });
});
