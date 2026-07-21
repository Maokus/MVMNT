import type { ExportSettings } from '@context/visualizer/types';

export interface ExportPreset {
    id: string;
    name: string;
    settings: Partial<ExportSettings>;
    builtin?: boolean;
}

const STORAGE_KEY = 'mvmnt.desktop.export-presets.v1';

export const BUILTIN_EXPORT_PRESETS: ExportPreset[] = [
    { id: 'social-square', name: 'Social Square 1080', builtin: true, settings: { width: 1080, height: 1080, fps: 30 } },
    { id: 'social-portrait', name: 'Social Portrait 1080×1920', builtin: true, settings: { width: 1080, height: 1920, fps: 30 } },
    { id: 'hd-landscape', name: 'HD Landscape 1920×1080', builtin: true, settings: { width: 1920, height: 1080, fps: 60 } },
    { id: 'transparent-png', name: 'Transparent PNG Sequence', builtin: true, settings: { transparentBackground: true } },
];

export function loadExportPresets(): ExportPreset[] {
    if (typeof localStorage === 'undefined') return BUILTIN_EXPORT_PRESETS;
    try {
        const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ExportPreset[];
        return [...BUILTIN_EXPORT_PRESETS, ...custom.filter((preset) => !preset.builtin && preset.id && preset.name)];
    } catch {
        return BUILTIN_EXPORT_PRESETS;
    }
}

export function saveExportPreset(name: string, settings: Partial<ExportSettings>): ExportPreset {
    const preset: ExportPreset = { id: crypto.randomUUID(), name: name.trim(), settings: structuredClone(settings) };
    const custom = loadExportPresets().filter((item) => !item.builtin);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...custom, preset]));
    return preset;
}

export function deleteExportPreset(id: string): void {
    const custom = loadExportPresets().filter((item) => !item.builtin && item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
}

export function expandExportFilename(
    template: string | undefined,
    values: { scene: string; preset?: string; width: number; height: number; fps: number; range?: string },
): string {
    const source = template?.trim() || '{scene}_{width}x{height}_{fps}fps';
    const date = new Date().toISOString().slice(0, 10);
    return source.replace(/\{(scene|preset|width|height|fps|range|date)\}/g, (_match, key: string) => {
        const replacements: Record<string, string> = {
            scene: values.scene,
            preset: values.preset ?? '',
            width: String(values.width),
            height: String(values.height),
            fps: String(values.fps),
            range: values.range ?? 'full',
            date,
        };
        return replacements[key] ?? '';
    }).replace(/[^a-z0-9_.\-]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'export';
}
