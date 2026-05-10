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
    audioCalculatorsApi,
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
            const expectedCapabilities = [
                'timelineRead',
                'audioFeaturesRead',
                'timingConversion',
                'midiUtils',
                'audioCalculatorsRegister',
            ];

            const actualCapabilities = Object.keys(PLUGIN_CAPABILITIES);
            for (const key of expectedCapabilities) {
                expect(actualCapabilities).toContain(key);
            }
        });

        it('should provide direct proxy APIs for each capability', () => {
            expect(typeof timelineApi).toBe('object');
            expect(typeof audioApi).toBe('object');
            expect(typeof timingApi).toBe('object');
            expect(typeof utilitiesApi).toBe('object');
            expect(typeof audioCalculatorsApi).toBe('object');
        });

        it('should provide convenience shorthand functions', () => {
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
            // Reference mapping:
            //   timelineRead              → timelineApi
            //   audioFeaturesRead         → audioApi
            //   timingConversion          → timingApi
            //   midiUtils                 → utilitiesApi
            //   audioCalculatorsRegister  → audioCalculatorsApi

            const capabilityToExportName: Record<string, string> = {
                timelineRead: 'timelineApi',
                audioFeaturesRead: 'audioApi',
                timingConversion: 'timingApi',
                midiUtils: 'utilitiesApi',
                audioCalculatorsRegister: 'audioCalculatorsApi',
            };

            const actualCapabilities = Object.keys(PLUGIN_CAPABILITIES);

            for (const [capability, exportName] of Object.entries(capabilityToExportName)) {
                expect(actualCapabilities).toContain(capability);
                expect(exportName).toBeDefined();
            }
        });

        it('should match PLUGIN_CAPABILITIES keys with exported proxies', () => {
            const capabilities = Object.keys(PLUGIN_CAPABILITIES);
            const expectedExports = ['timelineApi', 'audioApi', 'timingApi', 'utilitiesApi', 'audioCalculatorsApi'];

            expect(capabilities).toHaveLength(expectedExports.length);

            expect(timelineApi).toBeDefined();
            expect(audioApi).toBeDefined();
            expect(timingApi).toBeDefined();
            expect(utilitiesApi).toBeDefined();
            expect(audioCalculatorsApi).toBeDefined();
        });
    });

    describe('Access pattern consistency', () => {
        it('should provide consistent access methods (status-based, direct, shorthand)', () => {
            const result = getPluginHostApi();
            expect(result).toBeDefined();
            expect('status' in result).toBe(true);
            expect('api' in result).toBe(true);
        });

        it('should have shorthand helpers for timeline operations', () => {
            expect(typeof selectNotes).toBe('function');
            const sig = selectNotes.toString();
            expect(sig).toContain('trackIds');
            expect(sig).toContain('startSec');
            expect(sig).toContain('endSec');
            expect(typeof selectAllNotes).toBe('function');
            expect(typeof selectDistinctNotes).toBe('function');
            expect(typeof selectNotesByPitch).toBe('function');
            expect(typeof getNoteRange).toBe('function');
            expect(typeof getTimelineDuration).toBe('function');
            expect(typeof getMidiTracks).toBe('function');
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
            expect(typeof sampleAudio).toBe('function');
            expect(typeof sampleAudioRange).toBe('function');
        });

        it('should have shorthand helpers for timing operations', () => {
            expect(typeof timeToBeats).toBe('function');
            expect(typeof beatsToTime).toBe('function');
            expect(typeof timeToTicks).toBe('function');
            expect(typeof ticksToTime).toBe('function');
            expect(typeof beatToTicks).toBe('function');
            expect(typeof ticksToBeat).toBe('function');
        });

        it('should have shorthand helper for utility operations', () => {
            expect(typeof noteName).toBe('function');
        });

        it('should have shorthand helpers for CC operations', () => {
            expect(typeof selectCC).toBe('function');
            expect(typeof getSustainState).toBe('function');
        });

        it('should export the audio calculator registration API', () => {
            expect(audioCalculatorsApi).toBeDefined();
            expect(typeof audioCalculatorsApi).toBe('object');
        });

        it('should export TimelineCCEvent type', () => {
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
            // If someone adds a new key to PLUGIN_CAPABILITIES without exporting it from
            // plugin-sdk.ts, the compile-time satisfies check on _verifyCapabilityExports
            // will error. This test verifies all current capabilities are accounted for.
            const capabilities = Object.keys(PLUGIN_CAPABILITIES);
            expect(capabilities.length).toBeGreaterThan(0);

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
                    case 'audioCalculatorsRegister':
                        expect(audioCalculatorsApi).toBeDefined();
                        break;
                    default:
                        throw new Error(`Unexpected capability: ${cap}`);
                }
            });
        });
    });
});
