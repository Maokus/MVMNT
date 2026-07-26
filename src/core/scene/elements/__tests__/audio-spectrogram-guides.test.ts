import { describe, expect, it } from 'vitest';
import { AudioSpectrogramElement } from '@core/scene/elements/audio-displays/audio-spectrogram';

describe('audio spectrogram guide schema', () => {
    it('groups guide controls and exposes independent note origins', () => {
        const guides = AudioSpectrogramElement.getConfigSchema().tabs
            .flatMap((tab) => tab.groups)
            .find((group) => group.id === 'guides');

        expect(guides?.layout?.map((node) => node.kind === 'section' ? node.id : null)).toEqual([
            'frequency-guides',
            'time-guides',
            'guide-appearance',
        ]);
        expect(guides?.properties.map((property) => property.key)).toEqual(expect.arrayContaining([
            'octaveGuideStartNote',
            'noteGuideStartNote',
            'showGuideLabels',
            'showBarGuides',
            'barGuideColor',
        ]));
    });
});
