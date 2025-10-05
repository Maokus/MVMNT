import { describe, it, expect } from 'vitest';
import ExportClock from '../export-clock';

// Mirror computeEncodeTimestamp logic from video-exporter (kept minimal for test stability)
function computeEncodeTimestamp(renderTime: number, playRangeStartSec: number) {
    const t = renderTime - playRangeStartSec;
    return t < 0 ? 0 : t;
}

describe('Video Export timestamp normalization', () => {
    it('produces zero-based encode timestamps when play range starts later', () => {
        const fps = 60;
        const playStart = 4; // seconds
        const frames = 5;
        const clock = new ExportClock({ fps, playRangeStartSec: playStart });
        const times: number[] = [];
        for (let i = 0; i < frames; i++) {
            const renderTime = clock.timeForFrame(i);
            times.push(computeEncodeTimestamp(renderTime, playStart));
        }
        // First encode timestamp should be ~0
        expect(times[0]).toBeCloseTo(0, 10);
        // Subsequent frames advance by 1/fps
        expect(times[1]).toBeCloseTo(1 / fps, 10);
        expect(times[4]).toBeCloseTo(4 / fps, 10);
    });
});
