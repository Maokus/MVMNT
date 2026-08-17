export type ExportTerminalStatus = 'completed' | 'failed' | 'cancelled';
export type ExportExecutionMode = 'foreground' | 'background' | 'automation';

export type ExportTerminalAnalytics =
    | {
          event: 'export_completed';
          properties: { export_format: 'video' | 'png'; execution_mode: ExportExecutionMode };
      }
    | {
          event: 'export_cancelled';
          properties: { export_format: 'video' | 'png'; execution_mode: ExportExecutionMode };
      }
    | {
          event: 'export_failed';
          properties: {
              export_format: 'video' | 'png';
              execution_mode: ExportExecutionMode;
              failure_category: 'render';
          };
      };

export function takeExportTerminalAnalytics(
    reportedJobIds: Set<string>,
    jobId: string,
    exportFormat: 'video' | 'png',
    status: ExportTerminalStatus,
    executionMode: ExportExecutionMode
): ExportTerminalAnalytics | null {
    if (reportedJobIds.has(jobId)) return null;
    reportedJobIds.add(jobId);

    const properties = { export_format: exportFormat, execution_mode: executionMode };
    if (status === 'failed') {
        return { event: 'export_failed', properties: { ...properties, failure_category: 'render' } };
    }
    return {
        event: status === 'completed' ? 'export_completed' : 'export_cancelled',
        properties,
    };
}
