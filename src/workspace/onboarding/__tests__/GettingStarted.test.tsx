import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GettingStarted } from '../GettingStarted';
import { useTimelineStore } from '@state/timelineStore';

const { save, clearSelection } = vi.hoisted(() => ({ save: vi.fn(), clearSelection: vi.fn() }));
vi.mock('@context/SceneContext', () => ({ useScene: () => ({ saveToLocal: save }) }));
vi.mock('@context/SceneSelectionContext', () => ({ useSceneSelection: () => ({ clearSelection }) }));
const props = () => ({
    played: false,
    edited: false,
    saved: false,
    onDismiss: vi.fn(),
    revealProperties: vi.fn(),
    revealTimeline: vi.fn(),
    onRender: vi.fn(),
});

beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue(true);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('getting started checklist', () => {
    it('reveals the timeline and plays through its existing actions only on request', () => {
        const callbacks = props();
        const seek = vi.spyOn(useTimelineStore.getState(), 'seekTick');
        const toggle = vi.spyOn(useTimelineStore.getState(), 'togglePlay').mockImplementation(() => undefined);
        render(<GettingStarted {...callbacks} />);
        expect(toggle).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Play demo' }));
        expect(callbacks.revealTimeline).toHaveBeenCalledOnce();
        expect(seek).toHaveBeenCalledOnce();
        expect(toggle).toHaveBeenCalledOnce();
    });

    it('reveals properties, clears selection, and focuses the existing title field', async () => {
        const callbacks = props();
        const input = document.createElement('input');
        input.id = 'macro-value-TITLE';
        input.scrollIntoView = vi.fn();
        document.body.append(input);
        render(<GettingStarted {...callbacks} played />);
        fireEvent.click(screen.getByRole('button', { name: 'Show title control' }));
        expect(callbacks.revealProperties).toHaveBeenCalledOnce();
        expect(clearSelection).toHaveBeenCalledOnce();
        await waitFor(() => expect(input).toHaveFocus());
        expect(input.scrollIntoView).toHaveBeenCalledOnce();
        input.remove();
    });

    it('leaves cancelled or failed saves retryable and does not claim completion', async () => {
        save.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('Disk full'));
        render(<GettingStarted {...props()} played edited />);
        fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not saved'));
        fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save'));
        expect(screen.getByRole('button', { name: /Getting started/ })).toHaveTextContent('2/3');
    });

    it('supports collapse and dismissal, and hands off to render without exporting', () => {
        const callbacks = props();
        render(<GettingStarted {...callbacks} played edited saved />);
        fireEvent.click(screen.getByRole('button', { name: /Getting started/ }));
        expect(screen.queryByRole('button', { name: 'Render a video' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Getting started/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Render a video' }));
        expect(callbacks.onRender).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: 'Use your own music' }));
        expect(screen.getByText(/MIDI drives visuals/)).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting started' }));
        expect(callbacks.onDismiss).toHaveBeenCalledOnce();
    });
});
