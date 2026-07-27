import { describe, expect, it } from 'vitest';
import { initialOutputPath, updateDestinationExtension } from '../exportDestination';

describe('export destination helpers', () => {
    it('updates the selected destination extension when the video container changes', () => {
        expect(updateDestinationExtension('/exports/scene.mp4', 'video', 'webm', false)).toBe('/exports/scene.webm');
        expect(updateDestinationExtension('/exports/scene.webm', 'png', 'webm', false)).toBe('/exports/scene');
    });

    it('reuses the previous destination folder with the current scene filename', () => {
        expect(
            initialOutputPath('/exports/previous-export.webm', 'Current Scene', 'video', {
                container: 'webm',
                transparentBackground: false,
            } as any)
        ).toBe('/exports/Current Scene.webm');
    });
});
