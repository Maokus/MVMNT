import { describe, expect, it } from 'vitest';
import { unresolvedTrackInputs, type TrackInputDef } from './trackInputSetup';

const tracks = { midi: { type: 'midi' }, audio: { type: 'audio' } };
const input: TrackInputDef = { key: 'track', label: 'Track' };

describe('unresolved track inputs', () => {
    it('accepts assigned single and multiple compatible tracks', () => {
        expect(unresolvedTrackInputs([input], { track: { type: 'constant', value: 'midi' } }, tracks)).toEqual([]);
        expect(
            unresolvedTrackInputs(
                [{ ...input, allowMultiple: true }],
                { track: { type: 'constant', value: ['midi'] } },
                tracks
            )
        ).toEqual([]);
        expect(
            unresolvedTrackInputs(
                [{ ...input, allowedTrackTypes: ['audio'] }],
                { track: { type: 'constant', value: 'audio' } },
                tracks
            )
        ).toEqual([]);
    });
    it.each([null, '', [], 'missing', 'audio', ['midi']])('prompts for unresolved single selection %j', (value) => {
        expect(unresolvedTrackInputs([input], { track: { type: 'constant', value } }, tracks)).toEqual([input]);
    });
    it.each([[], ['midi', 'missing'], ['audio'], 'midi'])('rejects invalid multiple selection %j', (value) => {
        const multiple = { ...input, allowMultiple: true };
        expect(unresolvedTrackInputs([multiple], { track: { type: 'constant', value } }, tracks)).toEqual([multiple]);
    });
    it('preserves macro and automation connections', () => {
        expect(unresolvedTrackInputs([input], { track: { type: 'macro', macroId: 'macro' } }, tracks)).toEqual([]);
        expect(unresolvedTrackInputs([input], { track: { type: 'keyframes', channelId: 'channel' } }, tracks)).toEqual(
            []
        );
    });
    it('only includes unresolved inputs in mixed configurations', () => {
        const audio: TrackInputDef = { key: 'audio', label: 'Audio', allowedTrackTypes: ['audio'] };
        expect(unresolvedTrackInputs([input, audio], { track: { type: 'constant', value: 'midi' } }, tracks)).toEqual([
            audio,
        ]);
    });
});
