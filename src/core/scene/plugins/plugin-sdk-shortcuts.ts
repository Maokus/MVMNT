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
import type { TimelineNoteEvent } from '@core/timing/types';
import type { TimelineCCEvent } from '@core/timing/types';
import type { FeatureInput, FeatureDataResult } from '@audio/features/sceneApi';

/**
 * Select notes in a specific time window
 * @returns Array of notes, or empty array if timeline API unavailable
 */
export function selectNotes(trackIds: string[], startSec: number, endSec: number): TimelineNoteEvent[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.selectNotesInWindow({ trackIds, startSec, endSec });
}

/**
 * Select notes from ALL MIDI tracks in a time window
 * @returns Array of notes sorted by startTime, or empty array if timeline API unavailable
 */
export function selectAllNotes(startSec: number, endSec: number): TimelineNoteEvent[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.selectAllNotesInWindow({ startSec, endSec });
}

/**
 * Get all distinct MIDI note numbers (0–127) used in the given window, sorted ascending.
 * Omit all args to get every distinct note across all tracks and all time.
 * @returns Sorted array of unique note numbers, e.g. [36, 60, 64, 67]
 */
export function selectDistinctNotes(args?: { trackIds?: string[]; startSec?: number; endSec?: number }): number[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.selectDistinctNoteNumbers(args);
}

/**
 * Get all MIDI tracks on the timeline
 * @returns Array of MIDI tracks, or empty array if timeline API unavailable
 */
export function getMidiTracks() {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.getMidiTracks();
}

/**
 * Get all events for a single MIDI note number.
 * Omit trackIds/window to search all tracks across all time.
 * @returns Matching note events, or empty array if timeline API unavailable
 */
export function selectNotesByPitch(
    note: number,
    args?: { trackIds?: string[]; startSec?: number; endSec?: number }
): TimelineNoteEvent[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.selectNotesByPitch(note, args);
}

/**
 * Get the min and max MIDI note numbers used in the given tracks/window.
 * Omit all args to check across all tracks and all time.
 * @returns { min, max } pitch range, or null if there are no notes
 */
export function getNoteRange(args?: {
    trackIds?: string[];
    startSec?: number;
    endSec?: number;
}): { min: number; max: number } | null {
    const { api } = getPluginHostApi();
    if (!api) {
        return null;
    }
    return api.timeline.getNoteRange(args);
}

/**
 * Total scene duration in seconds (playback range end, or timeline view end as fallback).
 * @returns Duration in seconds, or 0 if timeline API unavailable
 */
export function getTimelineDuration(): number {
    const { api } = getPluginHostApi();
    if (!api) {
        return 0;
    }
    return api.timeline.getTimelineDuration();
}

/**
 * Group an array of note events by MIDI note number.
 * Pure utility — does not call the host API.
 * @returns Map from note number to events, sorted by note number ascending
 */
export function groupNotesByPitch(notes: TimelineNoteEvent[]): Map<number, TimelineNoteEvent[]> {
    const map = new Map<number, TimelineNoteEvent[]>();
    for (const event of notes) {
        let bucket = map.get(event.note);
        if (!bucket) {
            bucket = [];
            map.set(event.note, bucket);
        }
        bucket.push(event);
    }
    // Return entries in ascending pitch order
    return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * Sample an audio feature at a specific time.
 *
 * @recommended Use this for simple one-shot sampling. For cases where you need explicit
 * capability negotiation, use `getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead])` and
 * call `api.audio.sampleFeatureAtTime()` directly.
 *
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
 * Sample an audio feature over a range.
 *
 * @recommended Preferred over calling `sampleFeatureAtTime` in a loop. For explicit capability
 * negotiation, use `getPluginHostApi([PLUGIN_CAPABILITIES.audioFeaturesRead])` instead.
 *
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

/**
 * Select CC events in a time window, optionally filtered by controller number
 * @returns Array of CC events, or empty array if timeline API unavailable
 */
export function selectCC(args: {
    trackIds?: string[];
    controller?: number;
    startSec: number;
    endSec: number;
}): TimelineCCEvent[] {
    const { api } = getPluginHostApi();
    if (!api) {
        return [];
    }
    return api.timeline.selectCCInWindow(args);
}

/**
 * Check if sustain pedal (CC 64) is held at the given time
 * @returns true if pedal is down, false otherwise or if timeline API unavailable
 */
export function getSustainState(args: { trackIds?: string[]; timeSec: number }): boolean {
    const { api } = getPluginHostApi();
    if (!api) {
        return false;
    }
    return api.timeline.getSustainStateAtTime(args);
}
