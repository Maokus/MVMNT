import { describe, it, expect, beforeEach } from 'vitest';
import { unzipSync } from 'fflate';
import { exportScene, importScene } from '@persistence/index';
import { useTimelineStore } from '@state/timelineStore';
import { CANONICAL_PPQ } from '@core/timing/ppq';

function buildMidiCacheEntry() {
    return {
        midiData: {
            events: [
                { type: 'noteOn', note: 60, velocity: 100, time: 0, tick: 0, channel: 0 },
                {
                    type: 'noteOff',
                    note: 60,
                    velocity: 0,
                    time: 1,
                    tick: CANONICAL_PPQ,
                    channel: 0,
                },
            ],
            duration: 1,
            tempo: 120,
            ticksPerQuarter: CANONICAL_PPQ,
            timeSignature: { numerator: 4, denominator: 4, clocksPerClick: 24, thirtysecondNotesPerBeat: 8 },
            trimmedTicks: 0,
            tempoMap: [{ time: 0, tempo: 500000 }],
        },
        notesRaw: [
            {
                startTick: 0,
                endTick: CANONICAL_PPQ,
                durationTicks: CANONICAL_PPQ,
                note: 60,
                velocity: 100,
                channel: 0,
            },
        ],
        ticksPerQuarter: CANONICAL_PPQ,
    };
}

describe('MIDI asset packaging', () => {
    beforeEach(() => {
        useTimelineStore.setState((state: any) => ({
            ...state,
            tracks: {
                track1: {
                    id: 'track1',
                    type: 'midi',
                    name: 'MIDI Track',
                    midiSourceId: 'track1',
                    offsetTicks: 0,
                },
            },
            tracksOrder: ['track1'],
            midiCache: {
                track1: buildMidiCacheEntry(),
            },
        }));
    });

    it('stores MIDI cache entries as external assets in packaged exports', async () => {
        const result = await exportScene();
        if (!result.ok || result.mode !== 'zip-package') {
            throw new Error('Expected packaged export result');
        }

        const midiEntry = result.envelope.timeline.midiCache.track1;
        expect(midiEntry).toBeDefined();
        expect(midiEntry.assetRef).toMatch(/^assets\/midi\//);
        expect(midiEntry.assetId).toBeDefined();
        expect(midiEntry.notes?.count).toBe(1);
        expect(midiEntry.midiData).toBeUndefined();

        const zip = unzipSync(result.zip);
        expect(zip[midiEntry.assetRef]).toBeDefined();

        useTimelineStore.setState((state: any) => ({
            ...state,
            tracks: {},
            tracksOrder: [],
            midiCache: {},
        }));

        const importResult = await importScene(result.zip);
        expect(importResult.ok).toBe(true);
        const restored = useTimelineStore.getState().midiCache.track1;
        expect(restored?.notesRaw?.length).toBe(1);
        expect(restored?.midiData?.events?.length).toBeGreaterThan(0);
    });

    it('sanitizes circular references in MIDI cache entries before serialization', async () => {
        const baseEntry = buildMidiCacheEntry();
        const detail: any = {
            trackIndex: 0,
            name: 'Track 1',
            noteCount: 1,
            channels: [0],
            events: [],
            duration: 1,
        };
        const noteOn: any = {
            type: 'noteOn',
            note: 60,
            velocity: 100,
            time: 0,
            tick: 0,
            channel: 0,
        };
        // Introduce circular references resembling parser metadata links.
        noteOn.trackDetail = detail;
        detail.events.push(noteOn);
        detail.self = detail;
        const midiDataWithCycles: any = {
            ...baseEntry.midiData,
            events: [...baseEntry.midiData.events, noteOn],
            trackDetails: [detail],
        };
        midiDataWithCycles.events[0].linkedDetail = detail;
        const entryWithCycles = {
            ...baseEntry,
            midiData: midiDataWithCycles,
        };
        useTimelineStore.setState((state: any) => ({
            ...state,
            midiCache: {
                track1: entryWithCycles,
            },
        }));

        const result = await exportScene();
        expect(result.ok).toBe(true);
        if (!result.ok || result.mode !== 'zip-package') {
            throw new Error('Expected packaged export result');
        }

        const midiEntry = result.envelope.timeline.midiCache.track1;
        expect(midiEntry?.assetRef).toBeDefined();
        const zip = unzipSync(result.zip);
        const payloadBytes = zip[midiEntry.assetRef];
        expect(payloadBytes).toBeDefined();
        const payloadJson = new TextDecoder().decode(payloadBytes);
        const parsed = JSON.parse(payloadJson);
        expect(parsed.__mvmntMidiAssetVersion).toBe(1);
        expect(parsed?.midiData?.trackDetails?.[0]?.events?.[0]?.trackDetail).toBeUndefined();
        expect(parsed?.midiData?.events?.[0]?.linkedDetail?.self).toBeUndefined();
        expect(Array.isArray(parsed?.notesRaw)).toBe(true);
    });
});
