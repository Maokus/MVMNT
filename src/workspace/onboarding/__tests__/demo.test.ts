import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScenePackage } from '@persistence/scene-package';
import { parseMIDIFileToData } from '@core/midi/midi-library';

// The guide relies on these capabilities of the shipped example. Keep this
// contract checked when the template is edited or replaced.
describe('bundled onboarding demo', () => {
    it('contains a bound title, connected playable MIDI tracks, and embedded audio', async () => {
        const demo = parseScenePackage(new Uint8Array(readFileSync(resolve('src/templates/default.mvt'))));
        const { scene, timeline } = demo.envelope;
        const macros = scene.macros.macros;
        expect(macros.TITLE.type).toBe('longString');
        expect(macros.TITLE.value.trim()).not.toBe('');
        const bindings = Object.values(scene.elements).flatMap((element: any) => Object.values(element.properties));
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'macro', macroId: 'TITLE' }));
        for (const name of ['MELODY', 'SUPPORT', 'BASS']) {
            const trackId = macros[name].value;
            expect(timeline.tracks[trackId]).toMatchObject({ type: 'midi', enabled: true, mute: false });
            expect(bindings).toContainEqual(expect.objectContaining({ type: 'macro', macroId: name }));
            const bytes = demo.midiPayloads.get(trackId)!;
            expect(bytes?.length).toBeGreaterThan(0);
            const file = new File([Uint8Array.from(bytes)], 'demo.mid', { type: 'audio/midi' });
            file.arrayBuffer = async () => Uint8Array.from(bytes).buffer;
            const midi = await parseMIDIFileToData(file);
            expect(midi.events.some((event) => event.type === 'noteOn' && (event.velocity ?? 0) > 0)).toBe(true);
        }
        expect(timeline.tracks[macros.AUDIO.value]).toMatchObject({ type: 'audio', enabled: true, mute: false });
        expect(demo.audioPayloads.size).toBeGreaterThan(0);
    });
});
