import { useState, useCallback, useRef, useEffect } from 'react';
import type { MIDIData, MIDITrackDetails } from '@core/types';
import type { TempoImportChoice } from '@workspace/modals/MidiTempoImportModal';

export type MultiTrackChoice = 'single' | 'split' | 'cancel';

export interface MultiTrackDecisionState {
    fileName: string;
    midiData: MIDIData;
    tracks: MIDITrackDetails[];
}

/**
 * Manages the promise-resolver pattern for the MIDI import modal dialogs.
 * Callers await `requestImportMode` / `requestTempoImport`, which suspend until
 * the user dismisses the modal via `resolveImportMode` / `resolveTempoImport`.
 */
export function useImportModals() {
    const [multiTrackPrompt, setMultiTrackPrompt] = useState<MultiTrackDecisionState | null>(null);
    const multiTrackResolverRef = useRef<((choice: MultiTrackChoice) => void) | null>(null);
    const [tempoImportPrompt, setTempoImportPrompt] = useState<{ count: number; hasExisting: boolean } | null>(null);
    const tempoImportResolverRef = useRef<((choice: TempoImportChoice) => void) | null>(null);

    const requestImportMode = useCallback(
        (info: MultiTrackDecisionState) =>
            new Promise<MultiTrackChoice>((resolve) => {
                multiTrackResolverRef.current = resolve;
                setMultiTrackPrompt(info);
            }),
        [],
    );

    const resolveImportMode = useCallback((choice: MultiTrackChoice) => {
        const resolver = multiTrackResolverRef.current;
        multiTrackResolverRef.current = null;
        setMultiTrackPrompt(null);
        if (resolver) resolver(choice);
    }, []);

    const requestTempoImport = useCallback(
        (count: number, hasExisting: boolean) =>
            new Promise<TempoImportChoice>((resolve) => {
                tempoImportResolverRef.current = resolve;
                setTempoImportPrompt({ count, hasExisting });
            }),
        [],
    );

    const resolveTempoImport = useCallback((choice: TempoImportChoice) => {
        const resolver = tempoImportResolverRef.current;
        tempoImportResolverRef.current = null;
        setTempoImportPrompt(null);
        if (resolver) resolver(choice);
    }, []);

    // Cancel any pending promises on unmount to avoid memory leaks
    useEffect(() => {
        return () => {
            if (multiTrackResolverRef.current) {
                multiTrackResolverRef.current('cancel');
                multiTrackResolverRef.current = null;
            }
            if (tempoImportResolverRef.current) {
                tempoImportResolverRef.current('skip');
                tempoImportResolverRef.current = null;
            }
        };
    }, []);

    return {
        multiTrackPrompt,
        requestImportMode,
        resolveImportMode,
        tempoImportPrompt,
        requestTempoImport,
        resolveTempoImport,
    };
}
