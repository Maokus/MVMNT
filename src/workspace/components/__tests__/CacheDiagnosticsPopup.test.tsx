import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { CacheDiagnosticsPopup } from '@workspace/components/CacheDiagnosticsPopup';
import { useAudioDiagnosticsStore } from '@state/audioDiagnosticsStore';

describe('CacheDiagnosticsPopup', () => {
    beforeEach(() => {
        act(() => {
            useAudioDiagnosticsStore.getState().reset();
        });
    });

    afterEach(() => {
        act(() => {
            useAudioDiagnosticsStore.getState().reset();
        });
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

    it('calculate button triggers regenerateAll and dismiss', () => {
        act(() => {
            useAudioDiagnosticsStore.setState({ missingPopupVisible: true });
        });
        const dismissSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'dismissMissingPopup');
        const regenerateSpy = vi.spyOn(useAudioDiagnosticsStore.getState(), 'regenerateAll');
        render(<CacheDiagnosticsPopup />);
        fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
        expect(regenerateSpy).toHaveBeenCalledTimes(1);
        expect(dismissSpy).toHaveBeenCalledTimes(1);
    });
});
