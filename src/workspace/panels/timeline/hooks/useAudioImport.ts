import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import {
    AUDIO_IMPORT_DANGER_BYTES,
    AUDIO_IMPORT_WARNING_BYTES,
    estimateAudioImportBatch,
    formatBytes,
} from '@audio/audioMemoryDiagnostics';
import { recordAudioMemoryDiagnostic } from '@state/audioMemoryDiagnosticsStore';
import { isMidiFile, isAudioFile } from '../utils/fileTypeUtils';

export interface AudioImportProgressState {
    active: boolean;
    currentFile?: string;
    currentIndex: number;
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    cancelRequested: boolean;
    estimateRetainedBytes?: number;
}

const idleProgress: AudioImportProgressState = {
    active: false,
    currentIndex: 0,
    total: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    cancelRequested: false,
};

export function useAudioImport() {
    const addAudioTrack = useTimelineStore((s) => s.addAudioTrack);
    const audioFileRef = useRef<HTMLInputElement | null>(null);
    const cancelRequestedRef = useRef(false);
    const [audioImportProgress, setAudioImportProgress] = useState<AudioImportProgressState>(idleProgress);

    const importAudioFile = useCallback(
        async (file: File) => {
            if (isMidiFile(file)) {
                alert(
                    'MIDI files are not allowed for audio tracks. Please use an audio file (wav, mp3, ogg, flac, m4a).'
                );
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
                const reason =
                    error instanceof Error
                        ? error.message
                        : 'The format may be unsupported or the file may be corrupted.';
                alert(`Unable to import ${file.name}. ${reason}`);
                return false;
            }
        },
        [addAudioTrack]
    );

    const cancelAudioImport = useCallback(() => {
        cancelRequestedRef.current = true;
        setAudioImportProgress((current) => ({ ...current, cancelRequested: true }));
        recordAudioMemoryDiagnostic({
            severity: 'warning',
            stage: 'bulk-import-cancel-requested',
            message: 'Audio batch import cancellation requested; current decode will finish first',
        });
    }, []);

    const importAudioFiles = useCallback(
        async (files: File[]) => {
            const audioFiles = files.filter((file) => isAudioFile(file) && !isMidiFile(file));
            if (!audioFiles.length) return { imported: 0, skipped: 0, failed: 0, canceled: false };

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

            if (estimate.retainedHeapBytes >= AUDIO_IMPORT_WARNING_BYTES) {
                const severityLabel =
                    estimate.retainedHeapBytes >= AUDIO_IMPORT_DANGER_BYTES ? 'High risk' : 'Large import';
                const proceed = window.confirm(
                    `${severityLabel}: this audio batch is estimated to retain about ${formatBytes(estimate.retainedHeapBytes)} before later memory-reduction phases.\n\nFiles: ${audioFiles.length}\nOriginal bytes: ${formatBytes(estimate.fileBytes)}\nDecoded PCM estimate: ${formatBytes(estimate.decodedPcmBytes)}\n\nContinue importing?`
                );
                if (!proceed) {
                    recordAudioMemoryDiagnostic({
                        severity: 'warning',
                        stage: 'bulk-import-skipped',
                        message: `User skipped ${audioFiles.length} file audio batch after memory preflight`,
                        fileCount: audioFiles.length,
                        bytes: { retainedAudio: estimate.retainedHeapBytes },
                    });
                    return { imported: 0, skipped: audioFiles.length, failed: 0, canceled: true };
                }
            }

            cancelRequestedRef.current = false;
            let imported = 0;
            let skipped = 0;
            let failed = 0;
            setAudioImportProgress({
                active: true,
                total: audioFiles.length,
                currentIndex: 0,
                imported,
                skipped,
                failed,
                cancelRequested: false,
                estimateRetainedBytes: estimate.retainedHeapBytes,
            });

            for (let index = 0; index < audioFiles.length; index += 1) {
                const file = audioFiles[index];
                if (cancelRequestedRef.current) {
                    skipped += audioFiles.length - index;
                    break;
                }
                setAudioImportProgress((current) => ({
                    ...current,
                    currentFile: file.name,
                    currentIndex: index + 1,
                    imported,
                    skipped,
                    failed,
                }));
                const ok = await importAudioFile(file);
                if (ok) {
                    imported += 1;
                    recordAudioMemoryDiagnostic({
                        severity: 'info',
                        stage: 'bulk-import-step-complete',
                        message: `Imported ${file.name} (${imported}/${audioFiles.length})`,
                        fileName: file.name,
                        fileCount: audioFiles.length,
                    });
                } else {
                    failed += 1;
                    recordAudioMemoryDiagnostic({
                        severity: 'warning',
                        stage: 'bulk-import-step-failed',
                        message: `Failed to import ${file.name}; continuing batch`,
                        fileName: file.name,
                        fileCount: audioFiles.length,
                    });
                }
                setAudioImportProgress((current) => ({
                    ...current,
                    imported,
                    skipped,
                    failed,
                }));
            }

            const canceled = cancelRequestedRef.current;
            recordAudioMemoryDiagnostic({
                severity: canceled || failed ? 'warning' : 'info',
                stage: 'bulk-import-complete',
                message: `Audio batch complete: ${imported} imported, ${failed} failed, ${skipped} skipped`,
                fileCount: audioFiles.length,
            });
            cancelRequestedRef.current = false;
            setAudioImportProgress((current) => ({
                ...current,
                active: false,
                imported,
                skipped,
                failed,
                cancelRequested: false,
            }));
            return { imported, skipped, failed, canceled };
        },
        [importAudioFile]
    );

    const handleAddAudio = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            await importAudioFiles(files);
            if (audioFileRef.current) audioFileRef.current.value = '';
        },
        [importAudioFiles]
    );

    return { audioFileRef, importAudioFile, importAudioFiles, handleAddAudio, audioImportProgress, cancelAudioImport };
}
