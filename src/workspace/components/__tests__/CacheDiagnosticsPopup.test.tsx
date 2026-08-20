import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CacheDiagnosticsPopup } from '@workspace/components/CacheDiagnosticsPopup';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';
import { useTimelineStore } from '@state/timelineStore';

describe('CacheDiagnosticsPopup', () => {
    // zustand's `set()` copies the current dismissMissingPopup/regenerateAll references forward on every
    // update (they're never part of the partial state), so once a test spies on them, later `set()` calls
    // (from reset() or the actions themselves) keep propagating that same spy into future state snapshots.
    // Restore the pristine functions onto the live state directly so each test spies on an unmocked original.
    const originalDismissMissingPopup = useAudioDiagnosticsStore.getState().dismissMissingPopup;
    const originalRegenerateAll = useAudioDiagnosticsStore.getState().regenerateAll;

    function restoreStoreActions() {
        useAudioDiagnosticsStore.setState({
            dismissMissingPopup: originalDismissMissingPopup,
            regenerateAll: originalRegenerateAll,
        });
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        act(() => {
            restoreStoreActions();
            useAudioDiagnosticsStore.getState().reset();
            useTimelineStore.setState({ audioFeatureCacheStatus: {} });
        });
    });

    afterEach(() => {
        act(() => {
            restoreStoreActions();
            useAudioDiagnosticsStore.getState().reset();
            useTimelineStore.setState({ audioFeatureCacheStatus: {} });
        });
        vi.restoreAllMocks();
    });

    it('renders when diagnostics are enabled and popup is visible', () => {
        act(() => {
            useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        });
        render(<CacheDiagnosticsPopup />);
        expect(
            screen.getByText(
                'elements exist which require feature tracks that are not yet calculated. Calculate requested feature tracks?'
            )
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Calculate' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    });

    it('does not render when the popup is hidden', () => {
        render(<CacheDiagnosticsPopup />);
        expect(
            screen.queryByText(
                'elements exist which require feature tracks that are not yet calculated. Calculate requested feature tracks?'
            )
        ).not.toBeInTheDocument();
    });

    it('dismiss button hides the popup', () => {
        act(() => {
            useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        });
        const dismissSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'dismissMissingPopup');
        render(<CacheDiagnosticsPopup />);
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(dismissSpy).toHaveBeenCalledTimes(1);
    });

    it('calculate button starts regeneration without dismissing the popup', () => {
        act(() => {
            useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        });
        const dismissSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'dismissMissingPopup');
        const regenerateSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'regenerateAll');
        render(<CacheDiagnosticsPopup />);
        fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
        expect(regenerateSpy).toHaveBeenCalledTimes(1);
        expect(dismissSpy).not.toHaveBeenCalled();
    });

    it('shows live calculation progress after calculation starts', () => {
        const regenerateSpy = vi
            .spyOn(useAudioDiagnosticsStore.getState(), 'regenerateAll')
            .mockImplementation(() => {});
        act(() => {
            useTimelineStore.setState({
                audioFeatureCacheStatus: {
                    'audio-1': {
                        state: 'pending',
                        updatedAt: Date.now(),
                        progress: { value: 0.42, label: 'Spectrogram' },
                    },
                },
            });
            useAudioDiagnosticsStore.setState({
                missingPopupVisible: true,
                diffs: [
                    {
                        audioSourceId: 'audio-1',
                        missing: ['spectrogram'],
                        stale: [],
                    },
                ] as any,
            });
        });
        render(<CacheDiagnosticsPopup />);
        fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));

        expect(regenerateSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Calculating audio features')).toBeInTheDocument();
        expect(screen.getByText('Spectrogram')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Audio feature calculation progress' })).toHaveAttribute(
            'aria-valuenow',
            '42'
        );
    });
});
