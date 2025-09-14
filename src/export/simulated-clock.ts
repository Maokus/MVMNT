// SimulatedClock — deterministic time source for export rendering
// Computes absolute render times per frame, factoring FPS, optional prePadding, and optional play-range start.

import type { ExportTimingSnapshot } from './export-timing-snapshot';
import { snapshotSecondsToTicks, snapshotTicksToSeconds } from './export-timing-snapshot';

export interface SimulatedClockOptions {
    fps: number; // frames per second
    prePaddingSec?: number; // scene pre-roll padding (default 0)
    playRangeStartSec?: number; // optional play range start (seconds)
    startFrame?: number; // internal start frame offset for partial exports
    timingSnapshot?: ExportTimingSnapshot; // optional deterministic timing snapshot
}

export class SimulatedClock {
    private fps: number;
    private frameInterval: number;
    private prePadding: number;
    private playStart: number; // defaults to 0 (full scene)
    private startFrame: number;
    private snapshot: ExportTimingSnapshot | null;

    constructor(opts: SimulatedClockOptions) {
        this.fps = opts.fps;
        this.frameInterval = 1 / this.fps;
        this.prePadding = opts.prePaddingSec ?? 0;
        this.playStart = opts.playRangeStartSec ?? 0;
        this.startFrame = opts.startFrame ?? 0;
        this.snapshot = opts.timingSnapshot ?? null;
    }

    timeForFrame(frameIndex: number): number {
        // Base time: play range start minus prePadding
        const baseStartTime = this.playStart - this.prePadding;
        return baseStartTime + (this.startFrame + frameIndex) * this.frameInterval;
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

export default SimulatedClock;
