import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GettingStarted } from '../GettingStarted';

const { clearSelection } = vi.hoisted(() => ({ clearSelection: vi.fn() }));
vi.mock('@context/SceneSelectionContext', () => ({ useSceneSelection: () => ({ clearSelection }) }));
const props = () => ({
    played: false,
    edited: false,
    midiImported: false,
    midiConnected: false,
    audioImported: false,
    saved: false,
    rendered: false,
    step: 'play' as const,
    onDismiss: vi.fn(),
    revealProperties: vi.fn(),
    revealTimeline: vi.fn(),
});

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('tutorial checklist', () => {
    it('reveals and highlights the real play control without playing for the user', () => {
        const callbacks = props();
        render(<GettingStarted {...callbacks} />);
        expect(callbacks.revealTimeline).toHaveBeenCalled();
        expect(screen.getByText('Press Space to play! You can also use the highlighted Play control.')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Play demo' })).not.toBeInTheDocument();
    });

    it('reveals properties and points to the title field without editing it for the user', async () => {
        const callbacks = props();
        const input = document.createElement('input');
        input.dataset.tutorialTarget = 'edit-title';
        input.scrollIntoView = vi.fn();
        document.body.append(input);
        render(<GettingStarted {...callbacks} played step="edit-title" />);
        expect(callbacks.revealProperties).toHaveBeenCalled();
        expect(clearSelection).toHaveBeenCalled();
        await waitFor(() => expect(input.scrollIntoView).toHaveBeenCalledOnce());
        expect(input).toHaveFocus();
        expect(screen.getByText('Enter your own text in the highlighted songTitle field.')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Show title control' })).not.toBeInTheDocument();
        input.remove();
    });

    it('points to the existing save paths without saving for the user', () => {
        render(<GettingStarted {...props()} played edited midiImported midiConnected audioImported step="save" />);
        expect(screen.getByText(/Press Ctrl\/Cmd\+S to save/)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Save project' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Tutorial/ })).toHaveTextContent('4/6');
    });

    it('guides MIDI, audio, and rendering without task-performing buttons', () => {
        const callbacks = props();
        const { rerender } = render(<GettingStarted {...callbacks} played edited step="import-midi" />);
        expect(screen.getByText(/Choose your MIDI file/)).toBeVisible();
        rerender(<GettingStarted {...callbacks} played edited midiImported step="connect-midi" />);
        expect(screen.getByText(/Select your imported track/)).toBeVisible();
        rerender(<GettingStarted {...callbacks} played edited midiImported midiConnected step="import-audio" />);
        expect(screen.getByText(/Choose the matching audio file/)).toBeVisible();
        rerender(
            <GettingStarted {...callbacks} played edited midiImported midiConnected audioImported saved step="render" />
        );
        expect(screen.getByText(/Click the highlighted Render button/)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Render a video' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Use your own music' })).not.toBeInTheDocument();
    });

    it('supports collapse and dismissal after completion', () => {
        const callbacks = props();
        render(
            <GettingStarted
                {...callbacks}
                played
                edited
                midiImported
                midiConnected
                audioImported
                saved
                rendered
                step="complete"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /Tutorial/ }));
        expect(screen.queryByText('Tutorial complete!')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tutorial/ }));
        expect(screen.getByText('Tutorial complete!')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss tutorial' }));
        expect(callbacks.onDismiss).toHaveBeenCalledOnce();
    });
});
