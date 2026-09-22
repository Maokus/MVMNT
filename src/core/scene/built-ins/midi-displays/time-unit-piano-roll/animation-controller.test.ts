import { describe, expect, it } from 'vitest';
import { createTemporalFrame, TimingManager } from '@core/timing';
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

const createFrame = (anchorTime: number, start: number, end: number) => {
    const window = { domain: 'seconds' as const, start, end };
    return createTemporalFrame({
        anchor: { domain: 'seconds', value: anchorTime },
        viewport: window,
        materialization: window,
        cadence: 'transport-relative',
        reconstruction: 'hold',
        mapping: { mode: 'viewport', window },
    });
};

describe('Time Unit Piano Roll boundary geometry', () => {
    it('keeps a previous-window segment in its old geometry during release', () => {
        const timing = new TimingManager('time-unit-release');
        timing.setBPM(120);
        const temporalFrame = createFrame(2.1, 2, 4);
        const block = new NoteBlock(60, 0, 1.5, 2, 100);
        block.originalStartTime = 1.5;
        block.originalEndTime = 2.5;
        block.window = { domain: 'seconds', start: 0, end: 2 };

        const [note] = new AnimationController(createOwner()).buildNoteRenderObjects(
            {
                noteHeight: 10,
                minNote: 60,
                maxNote: 60,
                pianoWidth: 0,
                rollWidth: 100,
                temporalFrame,
                conversions: timing,
            },
            [block],
            2.1
        );

        expect(note).toMatchObject({ x: 75, width: 25, y: 0, height: 10 });
    });

    it('maps an attacking next-window segment in the next window coordinate frame', () => {
        const timing = new TimingManager('time-unit-attack');
        timing.setBPM(120);
        const temporalFrame = createFrame(3.8, 2, 4);
        const block = new NoteBlock(60, 0, 4, 4.5, 100);
        block.window = { domain: 'seconds', start: 4, end: 6 };

        const [note] = new AnimationController(createOwner()).buildNoteRenderObjects(
            {
                noteHeight: 10,
                minNote: 60,
                maxNote: 60,
                pianoWidth: 0,
                rollWidth: 100,
                temporalFrame,
                conversions: timing,
            },
            [block],
            3.8
        );

        expect(note).toMatchObject({ x: 0, width: 25, y: 0, height: 10 });
    });
});
