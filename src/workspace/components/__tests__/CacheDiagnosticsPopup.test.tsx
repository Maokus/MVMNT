import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CacheDiagnosticsPopup } from '@workspace/components/CacheDiagnosticsPopup';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';

describe('CacheDiagnosticsPopup', () => {
    beforeEach(() => {
        useAudioDiagnosticsStore.getState().reset();
        (window as any).__MVMNT_FLAGS__ = { 'feature.audioVis.cacheDiagnosticsPhase3': true };
    });

    afterEach(() => {
        useAudioDiagnosticsStore.getState().reset();
        delete (window as any).__MVMNT_FLAGS__;
    });

    it('renders when diagnostics are enabled and popup is visible', () => {
        useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        render(<CacheDiagnosticsPopup />);
        expect(
            screen.getByText(
                'elements exist which require feature tracks that are not yet calculated. Calculate requested feature tracks?'
            )
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Calculate' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    });

    it('does not render when feature flag is disabled', () => {
        (window as any).__MVMNT_FLAGS__ = { 'feature.audioVis.cacheDiagnosticsPhase3': false };
        useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        render(<CacheDiagnosticsPopup />);
        expect(
            screen.queryByText(
                'elements exist which require feature tracks that are not yet calculated. Calculate requested feature tracks?'
            )
        ).not.toBeInTheDocument();
    });

    it('dismiss button hides the popup', () => {
        useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        const dismissSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'dismissMissingPopup');
        render(<CacheDiagnosticsPopup />);
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(dismissSpy).toHaveBeenCalledTimes(1);
    });

    it('calculate button triggers regenerateAll and dismiss', () => {
        useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        const dismissSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'dismissMissingPopup');
        const regenerateSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'regenerateAll');
        render(<CacheDiagnosticsPopup />);
        fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
        expect(regenerateSpy).toHaveBeenCalledTimes(1);
        expect(dismissSpy).toHaveBeenCalledTimes(1);
    });
});
