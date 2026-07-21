import { beforeEach, describe, expect, it } from 'vitest';
import { deleteExportPreset, expandExportFilename, loadExportPresets, saveExportPreset } from '../export-presets';

describe('export presets', () => {
    beforeEach(() => localStorage.clear());

    it('stores custom presets without replacing built-ins', () => {
        const preset = saveExportPreset('Client portrait', { width: 1080, height: 1920, fps: 30 });
        expect(loadExportPresets().find((item) => item.id === preset.id)?.settings.height).toBe(1920);
        deleteExportPreset(preset.id);
        expect(loadExportPresets().some((item) => item.id === preset.id)).toBe(false);
        expect(loadExportPresets().some((item) => item.builtin)).toBe(true);
    });

    it('expands portable filename templates and sanitizes the result', () => {
        expect(expandExportFilename('{scene}_{width}x{height}_{fps}fps_{range}', {
            scene: 'My / Scene',
            width: 1080,
            height: 1920,
            fps: 60,
            range: '0-12s',
        })).toBe('My_Scene_1080x1920_60fps_0-12s');
    });
});
