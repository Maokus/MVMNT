import { describe, expect, it } from 'vitest';
import { TimingManager, resolveTemporalWindow } from '@core/timing';
import { AnimationController } from './animation-controller';
import { NoteBlock } from './note-block';

const createOwner = () =>
    ({
        getAnimationType: () => 'none',
        getAttackDuration: () => 0.3,
        getDecayDuration: () => 0.3,
        getReleaseDuration: () => 0.3,
        getChannelColors: () => ['#ff0000'],
    }) as any;

describe('Time Unit Piano Roll boundary geometry', () => {
    it('keeps a previous-window segment in its old geometry during release', () => {
        const timing = new TimingManager('time-unit-release');
        timing.setBPM(120);
        const temporalFrame = resolveTemporalWindow(timing, 2.1, { cadence: 'transport-relative', bars: 1 });
        const block = new NoteBlock(60, 0, 1.5, 2, 100);
        block.originalStartTime = 1.5;
        block.originalEndTime = 2.5;
        block.windowStart = 0;
        block.windowEnd = 2;

        const [note] = new AnimationController(createOwner()).buildNoteRenderObjects(
            { noteHeight: 10, minNote: 60, maxNote: 60, pianoWidth: 0, rollWidth: 100, temporalFrame },
            [block],
            2.1
        );

        expect(note).toMatchObject({ x: 75, width: 25, y: 0, height: 10 });
    });

    it('maps an attacking next-window segment in the next window coordinate frame', () => {
        const timing = new TimingManager('time-unit-attack');
        timing.setBPM(120);
        const temporalFrame = resolveTemporalWindow(timing, 3.8, { cadence: 'transport-relative', bars: 1 });
        const block = new NoteBlock(60, 0, 4, 4.5, 100);
        block.windowStart = 4;
        block.windowEnd = 6;

        const [note] = new AnimationController(createOwner()).buildNoteRenderObjects(
            { noteHeight: 10, minNote: 60, maxNote: 60, pianoWidth: 0, rollWidth: 100, temporalFrame },
            [block],
            3.8
        );

        expect(note).toMatchObject({ x: 0, width: 25, y: 0, height: 10 });
    });
});
