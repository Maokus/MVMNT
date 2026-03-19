/**
 * Convenience shorthand methods for the plugin API.
 * These reduce deep nesting and provide intuitive function names for common operations.
 *
 * Examples:
 * - selectNotes() instead of api.timeline.selectNotesInWindow()
 * - sampleAudio() instead of api.audio.sampleFeatureAtTime()
 * - timeToBeats() instead of api.timing.secondsToBeats()
 */

import { getPluginHostApi } from './host-api/get-plugin-host-api';
import type { AudioSamplingOptions } from '@audio/features/audioFeatureTypes';
import type { TimelineNoteEvent } from '@state/selectors/timelineSelectors';
import type { FeatureInput, FeatureDataResult } from '@audio/features/sceneApi';

/**
 * Select notes in a specific time window
 * @returns Array of notes, or empty array if timeline API unavailable
 */
export function selectNotes(
    trackIds: string[],
    startSec: number,
    endSec: number
): TimelineNoteEvent[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.selectNotesInWindow({ trackIds, startSec, endSec });
}

/**
 * Sample an audio feature at a specific time
 * @returns Feature data, or null if audio API unavailable
 */
export function sampleAudio(
    trackId: string | null | undefined,
    feature: FeatureInput,
    time: number,
    options?: { element?: object; samplingOptions?: AudioSamplingOptions | null } | null
): FeatureDataResult | null {
    const { api } = getPluginHostApi();
    if (!api) {
        return null;
    }
    return api.audio.sampleFeatureAtTime({
        element: options?.element,
        trackId,
        feature,
        time,
        samplingOptions: options?.samplingOptions,
    });
}

/**
 * Sample an audio feature over a range
 * @returns Array of feature samples, or empty array if audio API unavailable
 */
export function sampleAudioRange(
    trackId: string | null | undefined,
    feature: FeatureInput,
    startTime: number,
    endTime: number,
    stepSec: number,
    options?: { element?: object; samplingOptions?: AudioSamplingOptions | null } | null
): FeatureDataResult[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.audio.sampleFeatureRange({
        element: options?.element,
        trackId,
        feature,
        startTime,
        endTime,
        stepSec,
        samplingOptions: options?.samplingOptions,
    });
}

/**
 * Convert seconds to beats
 * @returns Beats, or 0 if timing API unavailable
 */
export function timeToBeats(seconds: number): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timing.secondsToBeats(seconds) ?? 0;
}

/**
 * Convert beats to seconds
 * @returns Seconds, or 0 if timing API unavailable
 */
export function beatsToTime(beats: number): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timing.beatsToSeconds(beats) ?? 0;
}

/**
 * Convert seconds to ticks
 * @returns Ticks, or 0 if timing API unavailable
 */
export function timeToTicks(seconds: number): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timing.secondsToTicks(seconds) ?? 0;
}

/**
 * Convert ticks to seconds
 * @returns Seconds, or 0 if timing API unavailable
 */
export function ticksToTime(ticks: number): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timing.ticksToSeconds(ticks) ?? 0;
}

/**
 * Convert beats to ticks
 * @returns Ticks
 */
export function beatToTicks(beats: number): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timing.beatsToTicks(beats);
}

/**
 * Convert ticks to beats
 * @returns Beats
 */
export function ticksToBeat(ticks: number): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timing.ticksToBeats(ticks);
}

/**
 * Get the name of a MIDI note (e.g., "C4", "A#3")
 * @returns Note name
 */
export function noteName(noteNumber: number): string {
    const { api } = getPluginHostApi();
    if (!api) {
        return 'C-1';
    }
    return api.utilities.midiNoteToName(noteNumber);
}
