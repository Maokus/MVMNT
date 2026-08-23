import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentSaveStatus } from '../MenuBar';
import { TemplateLoadingOverlay } from '../../../components/TemplateLoadingOverlay';
import { useDocumentSaveStatusStore } from '@state/documentSaveStatusStore';
import { useTemplateStatusStore } from '@state/templateStatusStore';

describe('document save status', () => {
    beforeEach(() => {
        useDocumentSaveStatusStore.getState().clear();
        useTemplateStatusStore.setState({ isTemplateLoading: false, pendingCount: 0 });
    });

    it('shows accessible progress in the menu bar without activating the blocking loading overlay', () => {
        useDocumentSaveStatusStore.getState().setSaving(0.42, 'Packaging scene file…');
        render(
            <>
                <DocumentSaveStatus />
                <TemplateLoadingOverlay />
            </>
        );

        expect(screen.getByRole('status')).toHaveTextContent('Packaging scene file…');
        expect(screen.getByRole('progressbar', { name: 'Project save progress' })).toHaveAttribute(
            'aria-valuenow',
            '42'
        );
        expect(screen.queryByText(/thanks for your patience/i)).not.toBeInTheDocument();
    });

    it('keeps save failures visible with their details', () => {
        useDocumentSaveStatusStore.getState().setResult('error', 'Save failed', ['Disk is full']);
        render(<DocumentSaveStatus />);
        expect(screen.getByRole('status')).toHaveTextContent('Save failed');
        expect(screen.getByRole('status')).toHaveAttribute('title', 'Disk is full');
    });
});
