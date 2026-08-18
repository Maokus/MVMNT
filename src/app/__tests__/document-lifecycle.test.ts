import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsService } from '../analytics/contracts';
import {
    completePendingDocumentAnalytics,
    failPendingDocumentAnalytics,
    stagePendingDocumentAnalytics,
} from '../analytics/document-lifecycle';

function createAnalytics(): AnalyticsService {
    return {
        initialize: vi.fn(async () => true),
        capture: vi.fn(async () => undefined),
        captureMilestone: vi.fn(async () => undefined),
        identify: vi.fn(async () => undefined),
        reset: vi.fn(),
        setConsent: vi.fn(async () => undefined),
        getConsent: vi.fn(() => 'granted'),
        getIdentifier: vi.fn(async () => 'anonymous-id'),
        subscribeToConsent: vi.fn(() => () => undefined),
    };
}

describe('document analytics lifecycle', () => {
    beforeEach(() => sessionStorage.clear());

    it('emits document-open success only after import completion', async () => {
        const analytics = createAnalytics();
        stagePendingDocumentAnalytics({ source: 'browser_file_picker' });

        expect(analytics.capture).not.toHaveBeenCalled();
        await completePendingDocumentAnalytics(analytics);

        expect(analytics.capture).toHaveBeenCalledWith('document_opened', { source: 'browser_file_picker' });
        await failPendingDocumentAnalytics(analytics);
        expect(analytics.capture).toHaveBeenCalledTimes(1);
    });

    it('emits only a failure when a staged document import fails', async () => {
        const analytics = createAnalytics();
        stagePendingDocumentAnalytics({ source: 'drag_drop' });

        await failPendingDocumentAnalytics(analytics);
        await completePendingDocumentAnalytics(analytics);

        expect(analytics.capture).toHaveBeenCalledOnce();
        expect(analytics.capture).toHaveBeenCalledWith('document_operation_failed', {
            operation: 'open',
            failure_category: 'import',
        });
    });
});
