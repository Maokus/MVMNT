import type { AnalyticsService } from './contracts';

export interface PendingDocumentAnalytics {
    source?: 'file_picker' | 'browser_file_picker' | 'recent_documents' | 'drag_drop' | 'os_open' | 'community';
    createdEntryPoint?: 'home' | 'menu' | 'desktop_menu' | 'deep_link' | 'drag_drop' | 'community';
    templateEntryPoint?: 'home' | 'workspace' | 'community';
}

const PENDING_DOCUMENT_ANALYTICS_KEY = 'mvmnt.analytics.pending-document.v1';

export function stagePendingDocumentAnalytics(context: PendingDocumentAnalytics): void {
    try {
        sessionStorage.setItem(PENDING_DOCUMENT_ANALYTICS_KEY, JSON.stringify(context));
    } catch {
        // Analytics context must never block document workflows.
    }
}

function takePendingDocumentAnalytics(): PendingDocumentAnalytics | null {
    try {
        const raw = sessionStorage.getItem(PENDING_DOCUMENT_ANALYTICS_KEY);
        sessionStorage.removeItem(PENDING_DOCUMENT_ANALYTICS_KEY);
        return raw ? (JSON.parse(raw) as PendingDocumentAnalytics) : null;
    } catch {
        return null;
    }
}

export async function completePendingDocumentAnalytics(analytics: AnalyticsService): Promise<void> {
    const context = takePendingDocumentAnalytics();
    if (!context) return;
    if (context.source) await analytics.capture('document_opened', { source: context.source });
    if (context.createdEntryPoint)
        await analytics.capture('document_created', { entry_point: context.createdEntryPoint });
    if (context.templateEntryPoint)
        await analytics.capture('template_applied', { entry_point: context.templateEntryPoint });
}

export async function failPendingDocumentAnalytics(analytics: AnalyticsService): Promise<void> {
    const context = takePendingDocumentAnalytics();
    if (!context?.source) return;
    await analytics.capture('document_operation_failed', { operation: 'open', failure_category: 'import' });
}
