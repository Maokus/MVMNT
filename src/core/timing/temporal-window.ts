import { quarterNotesPerBar } from './meter';

export interface TemporalWindow {
    start: number;
    end: number;
}

export interface TemporalInterval {
    start: number;
    end: number;
}

interface TemporalWindowTiming {
    timeSignature: {
        numerator: number;
        denominator: number;
    };
    secondsToBeats(seconds: number): number;
    beatsToSeconds(beats: number): number;
    getTimeUnitWindow(referenceTimeInSeconds: number, bars?: number): TemporalWindow;
}

interface TemporalWindowFrameBase {
    anchorTime: number;
    viewport: TemporalWindow;
    materialization: TemporalWindow;
}

export interface ContinuousTemporalWindowFrame extends TemporalWindowFrameBase {
    cadence: 'continuous';
    reconstruction: 'interpolate';
    anchorPosition: number;
}

export interface SteppedTemporalWindowFrame extends TemporalWindowFrameBase {
    cadence: 'transport-relative';
    reconstruction: 'hold';
    windows: {
        previous: TemporalWindow;
        current: TemporalWindow;
        next: TemporalWindow;
    };
}

export type TemporalWindowFrame = ContinuousTemporalWindowFrame | SteppedTemporalWindowFrame;

export type TemporalWindowConfiguration =
    | {
          cadence: 'continuous';
          bars: number;
          anchorPosition: number;
      }
    | {
          cadence: 'transport-relative';
          bars: number;
          lookAheadSeconds?: number;
      };

const ADJACENT_WINDOW_SEEK_SECONDS = 1e-3;

/**
 * Resolve the temporal model shared by time-based visual elements.
 *
 * Continuous windows follow the anchor on every frame. Stepped windows hold a
 * bar-aligned viewport and expose its neighbours for boundary reconstruction.
 */
export function resolveTemporalWindow(
    timing: TemporalWindowTiming,
    anchorTime: number,
    configuration: Extract<TemporalWindowConfiguration, { cadence: 'continuous' }>
): ContinuousTemporalWindowFrame;
export function resolveTemporalWindow(
    timing: TemporalWindowTiming,
    anchorTime: number,
    configuration: Extract<TemporalWindowConfiguration, { cadence: 'transport-relative' }>
): SteppedTemporalWindowFrame;
export function resolveTemporalWindow(
    timing: TemporalWindowTiming,
    anchorTime: number,
    configuration: TemporalWindowConfiguration
): TemporalWindowFrame {
    if (configuration.cadence === 'continuous') {
        const windowBeats = configuration.bars * quarterNotesPerBar(timing.timeSignature);
        const anchorBeat = timing.secondsToBeats(anchorTime);
        const viewport = {
            start: timing.beatsToSeconds(anchorBeat - windowBeats * configuration.anchorPosition),
            end: timing.beatsToSeconds(anchorBeat + windowBeats * (1 - configuration.anchorPosition)),
        };
        return {
            cadence: 'continuous',
            reconstruction: 'interpolate',
            anchorTime,
            anchorPosition: configuration.anchorPosition,
            viewport,
            materialization: viewport,
        };
    }

    const current = timing.getTimeUnitWindow(anchorTime, configuration.bars);
    // Seeking just inside each neighbour preserves TimingManager's exact-boundary
    // policy while avoiding conversion round-trip drift under tempo automation.
    const previousResolved = timing.getTimeUnitWindow(current.start - ADJACENT_WINDOW_SEEK_SECONDS, configuration.bars);
    const nextResolved = timing.getTimeUnitWindow(current.end + ADJACENT_WINDOW_SEEK_SECONDS, configuration.bars);
    const previous = { start: previousResolved.start, end: current.start };
    const next = { start: current.end, end: nextResolved.end };

    return {
        cadence: 'transport-relative',
        reconstruction: 'hold',
        anchorTime,
        viewport: current,
        materialization: {
            start: previous.start,
            end: current.end + Math.max(0, configuration.lookAheadSeconds ?? 0),
        },
        windows: { previous, current, next },
    };
}

export function clipTemporalInterval(interval: TemporalInterval, window: TemporalWindow): TemporalInterval | null {
    if (!(interval.start < window.end && interval.end > window.start)) return null;
    return {
        start: Math.max(interval.start, window.start),
        end: Math.min(interval.end, window.end),
    };
}

export function clipTemporalIntervalAcrossWindows(
    interval: TemporalInterval,
    windows: readonly TemporalWindow[]
): Array<{ interval: TemporalInterval; window: TemporalWindow }> {
    return windows.flatMap((window) => {
        const clipped = clipTemporalInterval(interval, window);
        return clipped ? [{ interval: clipped, window }] : [];
    });
}

/** Map a time to a viewport coordinate while preserving the frame's reconstruction semantics. */
export function mapTimeToTemporalPosition(
    time: number,
    frame: TemporalWindowFrame,
    window: TemporalWindow = frame.viewport,
    clamp = true
): number {
    const duration = Math.max(1e-9, window.end - window.start);
    const position =
        frame.cadence === 'continuous' && window === frame.viewport
            ? (time - frame.anchorTime) / duration + frame.anchorPosition
            : (time - window.start) / duration;
    return clamp ? Math.max(0, Math.min(1, position)) : position;
}
