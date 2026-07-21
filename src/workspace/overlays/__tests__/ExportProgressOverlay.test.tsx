import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExportJobStore } from '@export/export-job-store';
import ExportProgressOverlay from '../ExportProgressOverlay';

const activeJob = {
    id: 'export-1',
    kind: 'video',
    status: 'rendering',
    progress: 42,
    text: 'Rendering frame 42',
    snapshot: { sceneName: 'Test scene', settings: {}, createdAt: '', sceneElementCount: 0, trackCount: 0 },
    logs: [],
} as any;

afterEach(() => {
    act(() => useExportJobStore.setState({ jobs: [] }));
});

describe('ExportProgressOverlay', () => {
    it('collapses active exports instead of closing them and can expand again', () => {
        act(() => useExportJobStore.setState({ jobs: [activeJob] }));
        const onClose = vi.fn();

        render(<ExportProgressOverlay progress={42} text="Rendering frame 42" kind="video" onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Expand export progress' })).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Export progress' })).toHaveAttribute('aria-valuenow', '42');
        expect(screen.queryByText('Rendering frame 42')).not.toBeInTheDocument();
        expect(screen.queryByText('Test scene')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Expand export progress' }));

        expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
        expect(screen.getByText('Rendering frame 42')).toBeInTheDocument();
    });

    it('collapses completed exports and provides a close control when expanded', () => {
        const onClose = vi.fn();
        render(<ExportProgressOverlay progress={100} text="Export complete" kind="video" onClose={onClose} />);

        expect(screen.getByRole('button', { name: 'Close export progress' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide' }));

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Expand export progress' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Expand export progress' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close export progress' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
