import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { estimateAudioImportBatch, formatBytes } from '@audio/audioMemoryDiagnostics';
import { recordAudioMemoryDiagnostic } from '@state/audioMemoryDiagnosticsStore';
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
                const estimate = await estimateAudioImportBatch([file]);
                recordAudioMemoryDiagnostic({
                    severity: estimate.severity === 'ok' ? 'info' : 'warning',
                    stage: 'import-preflight',
                    message: `Importing ${file.name}; estimated retained audio ${formatBytes(estimate.retainedHeapBytes)}`,
                    fileName: file.name,
                    fileCount: 1,
                    bytes: {
                        file: estimate.fileBytes,
                        decodedPcm: estimate.decodedPcmBytes,
                        retainedAudio: estimate.retainedHeapBytes,
                    },
                });
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
            const audioFiles = files.filter((file) => isAudioFile(file) && !isMidiFile(file));
            if (audioFiles.length > 1) {
                const estimate = await estimateAudioImportBatch(audioFiles);
                recordAudioMemoryDiagnostic({
                    severity: estimate.severity === 'ok' ? 'info' : 'warning',
                    stage: 'bulk-import-preflight',
                    message: `${audioFiles.length} audio files selected; estimated retained audio ${formatBytes(estimate.retainedHeapBytes)}`,
                    fileCount: audioFiles.length,
                    bytes: {
                        file: estimate.fileBytes,
                        decodedPcm: estimate.decodedPcmBytes,
                        retainedAudio: estimate.retainedHeapBytes,
                    },
                });
            }
            for (const file of files) {
                await importAudioFile(file);
            }
            if (audioFileRef.current) audioFileRef.current.value = '';
        },
        [importAudioFile],
    );

    return { audioFileRef, importAudioFile, handleAddAudio };
}
