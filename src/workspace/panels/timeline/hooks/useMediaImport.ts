import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMidiImport, type UseMidiImportOptions } from './useMidiImport';
import { useAudioImport } from './useAudioImport';
import { isMidiFile, isAudioFile } from '../utils/fileTypeUtils';

export function useMediaImport(options: UseMidiImportOptions) {
    const { importMidiFile } = useMidiImport(options);
    const { importAudioFiles, audioImportProgress, cancelAudioImport } = useAudioImport();
    const fileRef = useRef<HTMLInputElement | null>(null);
    const busyRef = useRef(false);
    const mountedRef = useRef(true);
    const [stage, setStage] = useState<'idle' | 'midi' | 'audio'>('idle');

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const importFiles = useCallback(
        async (files: File[]) => {
            if (busyRef.current || !files.length) return;
            busyRef.current = true;
            try {
                const seen = new Set<string>();
                const midiFiles: File[] = [];
                const audioFiles: File[] = [];
                let ignored = 0;
                for (const file of files) {
                    const key = `${file.name}__${file.size}__${file.lastModified}__${file.type}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    // MIDI MIME types also match audio/*.
                    if (isMidiFile(file)) midiFiles.push(file);
                    else if (isAudioFile(file)) audioFiles.push(file);
                    else ignored += 1;
                }
                if (ignored)
                    alert(
                        `Ignored ${ignored} file${ignored > 1 ? 's' : ''}. Only MIDI (.mid/.midi) and common audio formats are supported.`
                    );
                if (midiFiles.length) setStage('midi');
                for (const file of midiFiles) {
                    if (!mountedRef.current) return;
                    try {
                        await importMidiFile(file);
                    } catch (error) {
                        console.error('Failed to import MIDI file', error);
                        alert(`Unable to import ${file.name}. Please verify the file is a valid MIDI.`);
                    }
                }
                if (audioFiles.length && mountedRef.current) {
                    setStage('audio');
                    try {
                        await importAudioFiles(audioFiles);
                    } catch (error) {
                        console.error('Failed to import audio batch', error);
                        alert('Unable to complete the audio import. Please try again.');
                    }
                }
            } finally {
                busyRef.current = false;
                if (mountedRef.current) setStage('idle');
            }
        },
        [importMidiFile, importAudioFiles]
    );

    const handleChange = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            await importFiles(files);
        },
        [importFiles]
    );

    return {
        fileRef,
        handleChange,
        importFiles,
        stage,
        busy: stage !== 'idle',
        audioImportProgress,
        cancelAudioImport,
    };
}
