export type ExportTerminalStatus = 'completed' | 'failed' | 'cancelled';
export type ExportExecutionMode = 'foreground' | 'background' | 'automation';
import type { ExportDurationBucket } from './analytics/contracts';

export function exportDurationBucket(createdAt: string, finishedAt: string | undefined): ExportDurationBucket {
    const elapsed = Date.parse(finishedAt ?? '') - Date.parse(createdAt);
    if (!Number.isFinite(elapsed) || elapsed < 0) return 'unknown';
    if (elapsed < 30_000) return 'under_30s';
    if (elapsed < 120_000) return '30s_2m';
    if (elapsed < 600_000) return '2m_10m';
    return 'over_10m';
}

export type ExportTerminalAnalytics =
    | {
          event: 'export_completed';
          properties: {
              export_attempt_id: string;
              export_format: 'video' | 'png';
              execution_mode: ExportExecutionMode;
              duration_bucket: ExportDurationBucket;
          };
      }
    | {
          event: 'export_cancelled';
          properties: {
              export_attempt_id: string;
              export_format: 'video' | 'png';
              execution_mode: ExportExecutionMode;
              duration_bucket: ExportDurationBucket;
          };
      }
    | {
          event: 'export_failed';
          properties: {
              export_format: 'video' | 'png';
              export_attempt_id: string;
              execution_mode: ExportExecutionMode;
              failure_category: 'render' | 'output';
              duration_bucket: ExportDurationBucket;
          };
      };

export function takeExportTerminalAnalytics(
    reportedJobIds: Set<string>,
    jobId: string,
    exportFormat: 'video' | 'png',
    status: ExportTerminalStatus,
    executionMode: ExportExecutionMode,
    failureCategory: 'render' | 'output' = 'render',
    createdAt = new Date().toISOString(),
    finishedAt?: string
): ExportTerminalAnalytics | null {
    if (reportedJobIds.has(jobId)) return null;
    reportedJobIds.add(jobId);

    const properties = {
        export_attempt_id: jobId,
        export_format: exportFormat,
        execution_mode: executionMode,
        duration_bucket: exportDurationBucket(createdAt, finishedAt),
    };
    if (status === 'failed') {
        return { event: 'export_failed', properties: { ...properties, failure_category: failureCategory } };
    }
    return {
        event: status === 'completed' ? 'export_completed' : 'export_cancelled',
        properties,
    };
}
