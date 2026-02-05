import { describe, it, expect } from 'vitest';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { TimingManager } from '@core/timing/timing-manager';
import {
    createExportTimingSnapshot,
    snapshotSecondsToTicks,
    snapshotTicksToSeconds,
} from '@export/export-timing-snapshot';
import { ExportClock } from '@export/export-clock';

describe('ExportTimingSnapshot', () => {
    it('roundtrip seconds->ticks->seconds stable fixed tempo', () => {
        const tm = new TimingManager();
        tm.setBPM(120); // 0.5s per beat
        tm.setTicksPerQuarter(CANONICAL_PPQ);
        const snap = createExportTimingSnapshot(tm);
        for (let sec = 0; sec <= 10; sec += 0.25) {
            const ticks = snapshotSecondsToTicks(snap, sec);
            const sec2 = snapshotTicksToSeconds(snap, ticks);
            expect(sec2).toBeCloseTo(sec, 1e-9);
        }
    });

    it('deterministic frame->tick mapping unaffected by live BPM change when snapshot used', () => {
        const tm = new TimingManager();
        tm.setBPM(100);
        tm.setTicksPerQuarter(CANONICAL_PPQ);
        const snap = createExportTimingSnapshot(tm);
        const clock = new ExportClock({ fps: 60, timingSnapshot: snap });
        const frameTicksBefore = Array.from({ length: 10 }, (_, i) => clock.ticksForFrame(i));
        // Change live BPM (should not affect snapshot-based mapping)
        tm.setBPM(200);
        const frameTicksAfter = Array.from({ length: 10 }, (_, i) => clock.ticksForFrame(i));
        expect(frameTicksAfter).toEqual(frameTicksBefore);
    });
});
