import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScenePackage } from '@persistence/scene-package';
import { parseMIDIFileToData } from '@core/midi/midi-library';

// The tutorial relies on these capabilities of the shipped example. Keep this
// contract checked when the template is edited or replaced.
describe('bundled tutorial project', () => {
    it('contains a bound title, connected playable MIDI tracks, and embedded audio', async () => {
        const tutorial = parseScenePackage(new Uint8Array(readFileSync(resolve('src/templates/kashiwadelike.mvt'))));
        const { scene, timeline } = tutorial.envelope;
        const macros = scene.macros.macros;
        expect(macros.songTitle.type).toBe('string');
        expect(macros.songTitle.value.trim()).not.toBe('');
        const bindings = Object.values(scene.elements).flatMap((element: any) => Object.values(element.properties));
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'macro', macroId: 'songTitle' }));
        const midiTrackId = macros.MIDITrack.value;
        expect(timeline.tracks[midiTrackId]).toMatchObject({ type: 'midi', enabled: true, mute: false });
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'macro', macroId: 'MIDITrack' }));
        const bytes = tutorial.midiPayloads.get(midiTrackId)!;
        expect(bytes?.length).toBeGreaterThan(0);
        const file = new File([Uint8Array.from(bytes)], 'tutorial.mid', { type: 'audio/midi' });
        file.arrayBuffer = async () => Uint8Array.from(bytes).buffer;
        const midi = await parseMIDIFileToData(file);
        expect(midi.events.some((event) => event.type === 'noteOn' && (event.velocity ?? 0) > 0)).toBe(true);
        expect(Object.values(timeline.tracks)).toContainEqual(
            expect.objectContaining({ type: 'audio', enabled: true, mute: false })
        );
        expect(tutorial.audioPayloads.size).toBeGreaterThan(0);
    });
});
