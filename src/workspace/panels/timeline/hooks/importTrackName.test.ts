import { describe, expect, it } from 'vitest';
import { getNextImportedTrackName } from './importTrackName';

describe('getNextImportedTrackName', () => {
    it('starts imported audio and MIDI tracks at one independently', () => {
        const tracks = {
            midi: { id: 'midi', name: 'MIDI Track 4', type: 'midi' as const },
        };

        expect(getNextImportedTrackName('audio', tracks)).toBe('Audio Track 1');
        expect(getNextImportedTrackName('midi', tracks)).toBe('MIDI Track 5');
    });

    it('uses the next number after existing imported tracks', () => {
        const tracks = {
            audioOne: { id: 'audio-one', name: 'Audio Track 1', type: 'audio' as const },
            audioTen: { id: 'audio-ten', name: 'Audio Track 10', type: 'audio' as const },
            renamed: { id: 'renamed', name: 'Vocals', type: 'audio' as const },
        };

        expect(getNextImportedTrackName('audio', tracks)).toBe('Audio Track 11');
    });
});
