// SimulatedClock — deterministic time source for export rendering
// Computes absolute render times per frame, factoring FPS and optional play-range start (padding removed).

import type { ExportTimingSnapshot } from './export-timing-snapshot';
import { snapshotSecondsToTicks, snapshotTicksToSeconds } from './export-timing-snapshot';

export interface ExportClockOptions {
    fps: number; // frames per second
    playRangeStartSec?: number; // optional play range start (seconds)
    startFrame?: number; // internal start frame offset for partial exports
    timingSnapshot?: ExportTimingSnapshot; // optional deterministic timing snapshot
}

export class ExportClock {
    private fps: number;
    private frameInterval: number;
    private playStart: number; // defaults to 0 (full scene)
    private startFrame: number;
    private snapshot: ExportTimingSnapshot | null;

    constructor(opts: ExportClockOptions) {
        this.fps = opts.fps;
        this.frameInterval = 1 / this.fps;
        this.playStart = opts.playRangeStartSec ?? 0;
        this.startFrame = opts.startFrame ?? 0;
        this.snapshot = opts.timingSnapshot ?? null;
    }

    timeForFrame(frameIndex: number): number {
        // Base time: play range start only (padding removed)
        return this.playStart + (this.startFrame + frameIndex) * this.frameInterval;
    }

    /**
     * Deterministic tick position for given frame using snapshot (if provided). If no snapshot
     * supplied, falls back to converting frame time assuming uniform tempo implied by snapshotless export.
     */
    ticksForFrame(frameIndex: number): number | null {
        if (!this.snapshot) return null;
        const t = this.timeForFrame(frameIndex);
        return snapshotSecondsToTicks(this.snapshot, t);
    }

    /**
     * Convenience inverse using snapshot (if present). Converts a tick back to seconds within snapshot.
     */
    secondsForTick(tick: number): number | null {
        if (!this.snapshot) return null;
        return snapshotTicksToSeconds(this.snapshot, tick);
    }

    *times(totalFrames: number): Generator<number> {
        for (let i = 0; i < totalFrames; i++) {
            yield this.timeForFrame(i);
        }
    }
}

export default ExportClock;
