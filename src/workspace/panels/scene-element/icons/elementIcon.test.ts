import { describe, expect, it } from 'vitest';
import { getSceneElementIcon } from './elementIcon';
import audioIcon from './audio.svg';
import midiIcon from './midi.svg';
import miscIcon from './misc.svg';
import pluginIcon from './plugin.svg';

describe('getSceneElementIcon', () => {
    it.each([
        ['audioSpectrum', 'Audio Displays', false, audioIcon],
        ['timeUnitPianoRoll', 'MIDI Displays', false, midiIcon],
        ['textOverlay', 'Misc', false, miscIcon],
        ['example:custom', 'Audio Displays', true, pluginIcon],
    ])('maps %s to its category icon', (type, category, isPlugin, expectedIcon) => {
        expect(getSceneElementIcon(type, category, isPlugin)).toBe(expectedIcon);
    });
});
