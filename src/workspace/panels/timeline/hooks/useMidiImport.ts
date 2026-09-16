import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { timelineCommandGateway, useTimelineStore } from '@state/timelineStore';
import { parseMIDIFileToData } from '@core/midi/midi-library';
import { splitMidiDataByTracks } from '@core/midi/midi-ingest';
import type { MIDIData } from '@core/types';
import { midiTempoMapToKeyframes } from '@core/timing/midi-tempo-to-keyframes';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { MultiTrackChoice, MultiTrackDecisionState } from './useImportModals';
import type { TempoImportChoice } from '@workspace/modals/MidiTempoImportModal';
import { getNextImportedTrackName } from './importTrackName';
import { normalizeTimeSignature } from '@core/timing/meter';

interface UseMidiImportOptions {
    requestImportMode: (info: MultiTrackDecisionState) => Promise<MultiTrackChoice>;
    requestTempoImport: (count: number, hasExisting: boolean) => Promise<TempoImportChoice>;
}

export function useMidiImport({ requestImportMode, requestTempoImport }: UseMidiImportOptions) {
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const importMidiFile = useCallback(
        async (file: File) => {
            let midiData: MIDIData;
            try {
                midiData = await parseMIDIFileToData(file);
            } catch (error) {
                console.error('Failed to parse MIDI file', error);
                alert(`Unable to read ${file.name}. Please verify the file is a valid MIDI.`);
                return false;
            }

            const details = midiData.trackDetails ?? [];
            const playableTracks = details.length ? details : [];
            let choice: MultiTrackChoice = 'single';
            if (playableTracks.length > 1) {
                choice = await requestImportMode({ fileName: file.name, midiData, tracks: playableTracks });
                if (choice === 'cancel') return false;
            }

            // Resolve tempo choices before mutating any project state.
            const midiTempoMap = (midiData as any).tempoMap as Array<{ time: number; tempo: number }> | undefined;
            let convertedTempo: Array<{ tick: number; bpm: number }> = [];
            let tempoChoice: TempoImportChoice = 'skip';
            if (midiTempoMap && midiTempoMap.length > 1) {
                try {
                    const tempoEntries = midiTempoMap.map((t) => ({ time: t.time, tempo: t.tempo }));
                    convertedTempo = midiTempoMapToKeyframes(tempoEntries, CANONICAL_PPQ);
                    const existingTa = useTimelineStore.getState().timeline.tempoAutomation;
                    const hasExisting = !!(existingTa?.enabled && existingTa.keyframes.length > 0);
                    tempoChoice = await requestTempoImport(convertedTempo.length, hasExisting);
                } catch (err) {
                    console.error('Failed to process MIDI tempo map', err);
                }
            }

            const before = useTimelineStore.getState();
            const hasMidiClips = Object.values(before.tracks).some(
                (track) => track?.type === 'midi' && (track.clips?.length ?? 0) > 0
            );
            const eligibility = before.midiTimingImport;
            if (eligibility.pending && !hasMidiClips) {
                const initialBpm =
                    convertedTempo[0]?.bpm ??
                    (midiTempoMap?.[0]?.tempo ? 60_000_000 / midiTempoMap[0].tempo : 60_000_000 / midiData.tempo);
                if (!eligibility.bpmTouched && Number.isFinite(initialBpm) && initialBpm > 0) {
                    await timelineCommandGateway.dispatchById('timeline.setGlobalBpm', { bpm: initialBpm });
                }
                if (!eligibility.meterTouched) {
                    const timeSignature = normalizeTimeSignature(midiData.timeSignature);
                    await timelineCommandGateway.dispatchById('timeline.setTimeSignature', { timeSignature });
                }
            }

            if (tempoChoice === 'replace' && convertedTempo.length) {
                await timelineCommandGateway.dispatchById('timeline.setTempoAutomation', {
                    enabled: true,
                    keyframes: convertedTempo,
                });
            } else if (tempoChoice === 'merge' && convertedTempo.length) {
                const existing = useTimelineStore.getState().timeline.tempoAutomation?.keyframes ?? [];
                const existingTicks = new Set(existing.map((keyframe) => keyframe.tick));
                const merged = [
                    ...existing,
                    ...convertedTempo.filter((keyframe) => !existingTicks.has(keyframe.tick)),
                ].sort((a, b) => a.tick - b.tick);
                await timelineCommandGateway.dispatchById('timeline.setTempoAutomation', {
                    enabled: true,
                    keyframes: merged,
                });
            }

            if (choice === 'single' || playableTracks.length <= 1) {
                await addMidiTrack({
                    name: getNextImportedTrackName('midi', useTimelineStore.getState().tracks),
                    midiData,
                    clipName: file.name,
                });
                useTimelineStore.getState().finishInitialMidiTimingImport();
                return true;
            }
            const splits = splitMidiDataByTracks(midiData);
            if (!splits.length) {
                await addMidiTrack({
                    name: getNextImportedTrackName('midi', useTimelineStore.getState().tracks),
                    midiData,
                    clipName: file.name,
                });
                useTimelineStore.getState().finishInitialMidiTimingImport();
                return true;
            }
            for (const entry of splits) {
                await addMidiTrack({
                    name: getNextImportedTrackName('midi', useTimelineStore.getState().tracks),
                    midiData: entry.data,
                    clipName: file.name,
                });
            }
            useTimelineStore.getState().finishInitialMidiTimingImport();
            return true;
        },
        [addMidiTrack, requestImportMode, requestTempoImport]
    );

    const handleAddFile = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            if (fileRef.current) fileRef.current.value = '';
            for (const file of files) {
                await importMidiFile(file);
            }
        },
        [importMidiFile]
    );

    return { fileRef, importMidiFile, handleAddFile };
}
