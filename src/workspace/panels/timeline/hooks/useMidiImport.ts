import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { parseMIDIFileToData } from '@core/midi/midi-library';
import { splitMidiDataByTracks } from '@core/midi/midi-ingest';
import type { MIDIData } from '@core/types';
import { midiTempoMapToKeyframes } from '@core/timing/midi-tempo-to-keyframes';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import type { MultiTrackChoice, MultiTrackDecisionState } from './useImportModals';
import type { TempoImportChoice } from '../modals/MidiTempoImportModal';

interface UseMidiImportOptions {
    requestImportMode: (info: MultiTrackDecisionState) => Promise<MultiTrackChoice>;
    requestTempoImport: (count: number, hasExisting: boolean) => Promise<TempoImportChoice>;
}

export function useMidiImport({ requestImportMode, requestTempoImport }: UseMidiImportOptions) {
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const importMidiFile = useCallback(
        async (file: File) => {
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            let midiData: MIDIData;
            try {
                midiData = await parseMIDIFileToData(file);
            } catch (error) {
                console.error('Failed to parse MIDI file', error);
                alert(`Unable to read ${file.name}. Please verify the file is a valid MIDI.`);
                return false;
            }

            // Check for tempo changes in the MIDI file
            const midiTempoMap = (midiData as any).tempoMap as Array<{ time: number; tempo: number }> | undefined;
            if (midiTempoMap && midiTempoMap.length > 1) {
                try {
                    const tempoEntries = midiTempoMap.map((t) => ({ time: t.time, tempo: t.tempo }));
                    const converted = midiTempoMapToKeyframes(tempoEntries, CANONICAL_PPQ);
                    const existingTa = useTimelineStore.getState().timeline.tempoAutomation;
                    const hasExisting = !!(existingTa?.enabled && existingTa.keyframes.length > 0);
                    const tempoChoice = await requestTempoImport(converted.length, hasExisting);
                    if (tempoChoice === 'replace') {
                        const api = useTimelineStore.getState();
                        if (!api.timeline.tempoAutomation?.enabled) api.enableTempoAutomation();
                        api.batchSetTempoKeyframes(converted);
                    } else if (tempoChoice === 'merge' && hasExisting) {
                        const api = useTimelineStore.getState();
                        const existing = api.timeline.tempoAutomation?.keyframes ?? [];
                        // Merge: existing keyframes take precedence at same tick
                        const existingTicks = new Set(existing.map((kf) => kf.tick));
                        const merged = [...existing, ...converted.filter((kf) => !existingTicks.has(kf.tick))];
                        merged.sort((a, b) => a.tick - b.tick);
                        api.batchSetTempoKeyframes(merged);
                    }
                } catch (err) {
                    console.error('Failed to process MIDI tempo map', err);
                }
            }

            const details = midiData.trackDetails ?? [];
            const playableTracks = details.length ? details : [];
            if (playableTracks.length <= 1) {
                const detailName = playableTracks[0]?.name?.trim();
                const trackName = detailName && detailName.length ? detailName : baseName;
                await addMidiTrack({ name: trackName, midiData });
                return true;
            }
            const choice = await requestImportMode({
                fileName: file.name,
                midiData,
                tracks: playableTracks,
            });
            if (choice === 'cancel') return false;
            if (choice === 'single') {
                await addMidiTrack({ name: baseName, midiData });
                return true;
            }
            const splits = splitMidiDataByTracks(midiData);
            if (!splits.length) {
                await addMidiTrack({ name: baseName, midiData });
                return true;
            }
            for (let index = 0; index < splits.length; index++) {
                const entry = splits[index];
                const labelCandidate = entry.track.name?.trim();
                const trackName = labelCandidate && labelCandidate.length
                    ? labelCandidate
                    : `${baseName} - Track ${index + 1}`;
                await addMidiTrack({ name: trackName, midiData: entry.data });
            }
            return true;
        },
        [addMidiTrack, requestImportMode, requestTempoImport],
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
        [importMidiFile],
    );

    return { fileRef, importMidiFile, handleAddFile };
}
