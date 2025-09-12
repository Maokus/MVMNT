// SimulatedClock — deterministic time source for export rendering
// Computes absolute render times per frame, factoring FPS, optional prePadding, and optional play-range start.

export interface SimulatedClockOptions {
    fps: number; // frames per second
    prePaddingSec?: number; // scene pre-roll padding (default 0)
    playRangeStartSec?: number; // optional play range start (seconds)
    startFrame?: number; // internal start frame offset for partial exports
}

export class SimulatedClock {
    private fps: number;
    private frameInterval: number;
    private prePadding: number;
    private playStart: number; // defaults to 0 (full scene)
    private startFrame: number;

    constructor(opts: SimulatedClockOptions) {
        this.fps = opts.fps;
        this.frameInterval = 1 / this.fps;
        this.prePadding = opts.prePaddingSec ?? 0;
        this.playStart = opts.playRangeStartSec ?? 0;
        this.startFrame = opts.startFrame ?? 0;
    }

    timeForFrame(frameIndex: number): number {
        // Base time: play range start minus prePadding
        const baseStartTime = this.playStart - this.prePadding;
        return baseStartTime + (this.startFrame + frameIndex) * this.frameInterval;
    }

    *times(totalFrames: number): Generator<number> {
        for (let i = 0; i < totalFrames; i++) {
            yield this.timeForFrame(i);
        }
    }
}

export default SimulatedClock;
