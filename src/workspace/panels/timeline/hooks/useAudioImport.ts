import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { isMidiFile, isAudioFile } from '../utils/fileTypeUtils';

export function useAudioImport() {
    const addAudioTrack = useTimelineStore((s) => s.addAudioTrack);
    const audioFileRef = useRef<HTMLInputElement | null>(null);

    const importAudioFile = useCallback(
        async (file: File) => {
            if (isMidiFile(file)) {
                alert('MIDI files are not allowed for audio tracks. Please use an audio file (wav, mp3, ogg, flac, m4a).');
                return false;
            }
            if (!isAudioFile(file)) {
                alert('Unsupported file type. Please select an audio file.');
                return false;
            }
            const name = file.name.replace(/\.[^/.]+$/, '');
            try {
                await addAudioTrack({ name, file });
                return true;
            } catch (error) {
                console.error('Failed to import audio track', error);
                const reason = error instanceof Error ? error.message : 'The format may be unsupported or the file may be corrupted.';
                alert(`Unable to import ${file.name}. ${reason}`);
                return false;
            }
        },
        [addAudioTrack],
    );

    const handleAddAudio = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            for (const file of files) {
                await importAudioFile(file);
            }
            if (audioFileRef.current) audioFileRef.current.value = '';
        },
        [importAudioFile],
    );

    return { audioFileRef, importAudioFile, handleAddAudio };
}
