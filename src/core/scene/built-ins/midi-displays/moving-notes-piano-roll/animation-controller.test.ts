import { describe, expect, it } from 'vitest';
import { TimingManager, resolveTemporalWindow } from '@core/timing';
import { MovingNotesAnimationController } from './animation-controller';

describe('Moving Notes Piano Roll temporal geometry', () => {
    it('keeps the playhead anchored and applies pixel offset before edge clipping across tempo changes', () => {
        const timing = new TimingManager('moving-notes-geometry');
        timing.setTempoMap([
            { time: 0, bpm: 120 },
            { time: 2, bpm: 60 },
        ]);
        const temporalFrame = resolveTemporalWindow(timing, 3, {
            cadence: 'continuous',
            bars: 1,
            anchorPosition: 0.5,
        });
        const controller = new MovingNotesAnimationController({
            getAnimationType: () => 'none',
            getAttackDuration: () => 0.3,
            getDecayDuration: () => 0.3,
            getReleaseDuration: () => 0.3,
            getChannelColors: () => ['#ff0000'],
        });

        const [note] = controller.buildNoteRenderObjects(
            {
                noteHeight: 10,
                minNote: 60,
                maxNote: 60,
                pianoWidth: 0,
                rollWidth: 100,
                playheadOffset: -10,
                temporalFrame,
            },
            [{ note: 60, velocity: 100, startTime: 1.5, endTime: 5 }]
        );

        expect(note).toMatchObject({ x: 0, y: 0, height: 10 });
        expect((note as unknown as { width: number }).width).toBeCloseTo(97.142857);
    });
});
