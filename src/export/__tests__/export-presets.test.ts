import { beforeEach, describe, expect, it } from 'vitest';
import {
    BUILTIN_EXPORT_PRESETS,
    deleteExportPreset,
    expandExportFilename,
    loadExportPresets,
    saveExportPreset,
} from '../presets';

describe('export presets', () => {
    it('provides built-in presets for the supported video formats', () => {
        expect(BUILTIN_EXPORT_PRESETS).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'transparent-video',
                    settings: expect.objectContaining({
                        container: 'webm',
                        videoCodec: 'vp9',
                        transparentBackground: true,
                    }),
                }),
                expect.objectContaining({
                    id: 'webm-video',
                    settings: expect.objectContaining({
                        container: 'webm',
                        videoCodec: 'vp9',
                        transparentBackground: false,
                    }),
                }),
                expect.objectContaining({
                    id: 'mp4-video',
                    settings: expect.objectContaining({
                        container: 'mp4',
                        videoCodec: 'h264',
                        transparentBackground: false,
                    }),
                }),
            ])
        );
    });

    beforeEach(() => localStorage.clear());

    it('stores custom presets without replacing built-ins', () => {
        const preset = saveExportPreset('Client portrait', { width: 1080, height: 1920, fps: 30 });
        expect(loadExportPresets().find((item) => item.id === preset.id)?.settings.height).toBe(1920);
        deleteExportPreset(preset.id);
        expect(loadExportPresets().some((item) => item.id === preset.id)).toBe(false);
        expect(loadExportPresets().some((item) => item.builtin)).toBe(true);
    });

    it('expands portable filename templates and sanitizes the result', () => {
        expect(
            expandExportFilename('{scene}_{width}x{height}_{fps}fps_{range}', {
                scene: 'My / Scene',
                width: 1080,
                height: 1920,
                fps: 60,
                range: '0-12s',
            })
        ).toBe('My_Scene_1080x1920_60fps_0-12s');
    });
});
