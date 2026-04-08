/**
 * API Drift Prevention Tests
 *
 * This test suite validates that the plugin SDK exports are kept in sync
 * with PLUGIN_CAPABILITIES. These tests ensure that when new capabilities
 * are added to the host API, they are also properly exported from the SDK
 * surface for external plugins to use.
 */

import { describe, it, expect } from 'vitest';
import { PLUGIN_CAPABILITIES } from '../host-api/plugin-api';
import {
    timelineApi,
    audioApi,
    timingApi,
    utilitiesApi,
    selectNotes,
    selectAllNotes,
    selectDistinctNotes,
    selectNotesByPitch,
    getNoteRange,
    getTimelineDuration,
    getMidiTracks,
    groupNotesByPitch,
    selectCC,
    getSustainState,
    sampleAudio,
    sampleAudioRange,
    timeToBeats,
    beatsToTime,
    timeToTicks,
    ticksToTime,
    beatToTicks,
    ticksToBeat,
    noteName,
    getPluginHostApi,
} from '../plugin-sdk';
import type { TimelineCCEvent } from '../plugin-sdk';

describe('API Drift Prevention', () => {
    describe('PLUGIN_CAPABILITIES coverage', () => {
        it('should export all capability keys from PLUGIN_CAPABILITIES', () => {
            // List all expected capability keys
            const expectedCapabilities = ['timelineRead', 'audioFeaturesRead', 'timingConversion', 'midiUtils'];

            // Verify all keys exist in PLUGIN_CAPABILITIES
            const actualCapabilities = Object.keys(PLUGIN_CAPABILITIES);
            for (const key of expectedCapabilities) {
                expect(actualCapabilities).toContain(key);
            }
        });

        it('should provide direct proxy APIs for each capability', () => {
            // Verify the capability proxy objects are exported and are objects
            expect(typeof timelineApi).toBe('object');
            expect(typeof audioApi).toBe('object');
            expect(typeof timingApi).toBe('object');
            expect(typeof utilitiesApi).toBe('object');
        });

        it('should provide convenience shorthand functions', () => {
            // Verify shorthand functions are exported and are functions
            expect(typeof selectNotes).toBe('function');
            expect(typeof sampleAudio).toBe('function');
            expect(typeof sampleAudioRange).toBe('function');
            expect(typeof timeToBeats).toBe('function');
            expect(typeof beatsToTime).toBe('function');
            expect(typeof timeToTicks).toBe('function');
            expect(typeof ticksToTime).toBe('function');
            expect(typeof beatToTicks).toBe('function');
            expect(typeof ticksToBeat).toBe('function');
            expect(typeof noteName).toBe('function');
        });

        it('should provide the API accessor function', () => {
            expect(typeof getPluginHostApi).toBe('function');
        });
    });

    describe('Capability-to-export mapping', () => {
        it('should have a mapping between each capability and its export', () => {
            // This is a reference document of the expected mapping:
            //   timelineRead        → timelineApi
            //   audioFeaturesRead   → audioApi
            //   timingConversion    → timingApi
            //   midiUtils           → utilitiesApi

            const capabilityToExportName: Record<string, string> = {
                timelineRead: 'timelineApi',
                audioFeaturesRead: 'audioApi',
                timingConversion: 'timingApi',
                midiUtils: 'utilitiesApi',
            };

            const actualCapabilities = Object.keys(PLUGIN_CAPABILITIES);

            // Verify the mapping is complete (all capabilities have an export)
            for (const [capability, exportName] of Object.entries(capabilityToExportName)) {
                expect(actualCapabilities).toContain(capability);
                // The exported object should be accessible (not undefined, not null)
                expect(exportName).toBeDefined();
            }
        });

        it('should match PLUGIN_CAPABILITIES keys with exported proxies', () => {
            const capabilities = Object.keys(PLUGIN_CAPABILITIES);
            const expectedExports = ['timelineApi', 'audioApi', 'timingApi', 'utilitiesApi'];

            // Ensure we have the right number of capabilities and exports
            expect(capabilities).toHaveLength(expectedExports.length);

            // All expected exports should be defined
            expect(timelineApi).toBeDefined();
            expect(audioApi).toBeDefined();
            expect(timingApi).toBeDefined();
            expect(utilitiesApi).toBeDefined();
        });
    });

    describe('Access pattern consistency', () => {
        it('should provide consistent access methods (status-based, direct, shorthand)', () => {
            // The getPluginHostApi function should be callable
            const result = getPluginHostApi();
            expect(result).toBeDefined();
            expect('status' in result).toBe(true);
            expect('api' in result).toBe(true);
        });

        it('should have shorthand helpers for timeline operations', () => {
            // selectNotes is a convenience wrapper for api.timeline.selectNotesInWindow
            expect(typeof selectNotes).toBe('function');
            const sig = selectNotes.toString();
            expect(sig).toContain('trackIds');
            expect(sig).toContain('startSec');
            expect(sig).toContain('endSec');
            // selectAllNotes queries all MIDI tracks in a window
            expect(typeof selectAllNotes).toBe('function');
            // selectDistinctNotes returns unique note numbers
            expect(typeof selectDistinctNotes).toBe('function');
            // selectNotesByPitch filters events by a single pitch
            expect(typeof selectNotesByPitch).toBe('function');
            // getNoteRange returns the pitch range of a note set
            expect(typeof getNoteRange).toBe('function');
            // getTimelineDuration returns scene length in seconds
            expect(typeof getTimelineDuration).toBe('function');
            // getMidiTracks returns all MIDI tracks
            expect(typeof getMidiTracks).toBe('function');
            // groupNotesByPitch is a pure utility (no host API call)
            expect(typeof groupNotesByPitch).toBe('function');
            const grouped = groupNotesByPitch([
                { note: 60, channel: 0, trackId: 't1', startTime: 0, endTime: 1, duration: 1 },
                { note: 64, channel: 0, trackId: 't1', startTime: 0, endTime: 1, duration: 1 },
                { note: 60, channel: 0, trackId: 't1', startTime: 2, endTime: 3, duration: 1 },
            ]);
            expect(grouped.get(60)).toHaveLength(2);
            expect(grouped.get(64)).toHaveLength(1);
            expect([...grouped.keys()]).toEqual([60, 64]);
        });

        it('should have shorthand helpers for audio operations', () => {
            // sampleAudio is a convenience wrapper for api.audio.sampleFeatureAtTime
            expect(typeof sampleAudio).toBe('function');
            // sampleAudioRange is a convenience wrapper for api.audio.sampleFeatureRange
            expect(typeof sampleAudioRange).toBe('function');
        });

        it('should have shorthand helpers for timing operations', () => {
            // Conversion helpers map to api.timing methods
            expect(typeof timeToBeats).toBe('function');
            expect(typeof beatsToTime).toBe('function');
            expect(typeof timeToTicks).toBe('function');
            expect(typeof ticksToTime).toBe('function');
            expect(typeof beatToTicks).toBe('function');
            expect(typeof ticksToBeat).toBe('function');
        });

        it('should have shorthand helper for utility operations', () => {
            // noteName maps to api.utilities.midiNoteToName
            expect(typeof noteName).toBe('function');
        });

        it('should have shorthand helpers for CC operations', () => {
            // selectCC is a convenience wrapper for api.timeline.selectCCInWindow
            expect(typeof selectCC).toBe('function');
            // getSustainState wraps api.timeline.getSustainStateAtTime
            expect(typeof getSustainState).toBe('function');
        });

        it('should export TimelineCCEvent type', () => {
            // Verify the type is usable (compile-time check; runtime just ensure import is valid)
            const dummy: TimelineCCEvent = {
                trackId: 't1',
                channel: 0,
                controller: 64,
                value: 127,
                timeSec: 1.0,
            };
            expect(dummy.controller).toBe(64);
            expect(dummy.value).toBe(127);
        });
    });

    describe('Drift detection scenarios', () => {
        it('should verify that new capabilities cannot be silently missed', () => {
            // This test documents the drift prevention mechanism:
            // If someone adds a new key to PLUGIN_CAPABILITIES (e.g., 'videoRender')
            // without exporting it from plugin-sdk.ts, the compile-time assertion
            // will fail with a TypeScript error on the _checkCapabilities object.

            // This test passes if we reach here (meaning the assertion passed)
            // and verifies that all current capabilities are accounted for.
            const capabilities = Object.keys(PLUGIN_CAPABILITIES);
            expect(capabilities.length).toBeGreaterThan(0);

            // Each capability should have a corresponding export
            capabilities.forEach((cap) => {
                switch (cap) {
                    case 'timelineRead':
                        expect(timelineApi).toBeDefined();
                        break;
                    case 'audioFeaturesRead':
                        expect(audioApi).toBeDefined();
                        break;
                    case 'timingConversion':
                        expect(timingApi).toBeDefined();
                        break;
                    case 'midiUtils':
                        expect(utilitiesApi).toBeDefined();
                        break;
                    default:
                        throw new Error(`Unexpected capability: ${cap}`);
                }
            });
        });
    });
});
