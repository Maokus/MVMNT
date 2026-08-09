import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildScenePackage } from '../scene-package-builder';

describe('buildScenePackage', () => {
    it('creates the portable package layout used by export and recovery autosave', () => {
        const zip = buildScenePackage({
            envelope: { format: 'mvmnt.scene', metadata: { name: 'Autosave' } },
            audioAssets: [['audio-1', { bytes: new Uint8Array([1]), filename: 'song.wav', mimeType: 'audio/wav' }]],
            midiAssets: [],
            fontAssets: [
                ['font-1/regular', { bytes: new Uint8Array([3]), filename: 'regular.woff2', mimeType: 'font/woff2' }],
                ['font-1/bold', { bytes: new Uint8Array([4]), filename: 'bold.woff2', mimeType: 'font/woff2' }],
            ],
            waveformAssets: [],
            audioFeatureAssets: [],
            pluginAssets: [],
            visualAssets: [['image-1', { bytes: new Uint8Array([2]), filename: 'cover.png', mimeType: 'image/png' }]],
        });

        const files = unzipSync(zip);
        expect(JSON.parse(strFromU8(files['document.json']))).toEqual({
            format: 'mvmnt.scene',
            metadata: { name: 'Autosave' },
        });
        expect(files['assets/audio/audio-1/song.wav']).toEqual(new Uint8Array([1]));
        expect(files['assets/visual/image-1/cover.png']).toEqual(new Uint8Array([2]));
        expect(files['assets/fonts/font-1/regular/regular.woff2']).toEqual(new Uint8Array([3]));
        expect(files['assets/fonts/font-1/bold/bold.woff2']).toEqual(new Uint8Array([4]));
        expect(files['Icon.icns']).toBeDefined();
    });
});
