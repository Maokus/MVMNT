import type { ExportKind, ExportSettings } from '@export/contracts';
import type { ExportFormat, VideoContainer } from './types';

export function destinationExtension(
    format: ExportFormat,
    container: VideoContainer,
    transparentBackground: boolean
): string {
    if (format !== 'video') return '';
    return transparentBackground || container === 'webm' ? '.webm' : '.mp4';
}

export function updateDestinationExtension(
    outputPath: string,
    format: ExportFormat,
    container: VideoContainer,
    transparentBackground: boolean
): string {
    if (!outputPath) return outputPath;
    const stem = outputPath.replace(/\.(mp4|webm)$/i, '');
    return `${stem}${destinationExtension(format, container, transparentBackground)}`;
}

/** Reuses the previously selected folder while making the current scene name the default. */
export function initialOutputPath(
    outputPath: string | undefined,
    sceneName: string,
    exportKind: ExportKind | null,
    exportSettings: ExportSettings
): string {
    if (!outputPath) return '';
    const separator = Math.max(outputPath.lastIndexOf('/'), outputPath.lastIndexOf('\\'));
    const directory = separator >= 0 ? outputPath.slice(0, separator + 1) : '';
    const format: ExportFormat = exportKind === 'png' ? 'png' : 'video';
    const container: VideoContainer = exportSettings.container === 'webm' ? 'webm' : 'mp4';
    return `${directory}${sceneName || 'export'}${destinationExtension(format, container, exportSettings.transparentBackground ?? false)}`;
}
