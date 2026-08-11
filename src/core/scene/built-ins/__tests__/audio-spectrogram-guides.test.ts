import { describe, expect, it } from 'vitest';
import {
    AudioSpectrogramElement,
    resolveSpectrogramAnalysis,
} from '@core/scene/built-ins/audio-displays/audio-spectrogram';

describe('audio spectrogram guide schema', () => {
    it('shows three color controls only when the custom color map is selected', () => {
        const spectrogram = AudioSpectrogramElement.getConfigSchema()
            .tabs.flatMap((tab) => tab.groups)
            .find((group) => group.id === 'spectrogram');
        const properties = new Map(spectrogram?.properties.map((property) => [property.key, property]));

        expect(properties.get('colorMap')?.options).toContainEqual({ label: 'Custom', value: 'custom' });
        for (const key of ['customLowColor', 'customMidColor', 'customHighColor']) {
            expect(properties.get(key)).toMatchObject({
                type: 'color',
                visibleWhen: [{ key: 'colorMap', equals: 'custom' }],
            });
        }
    });

    it('groups guide controls and exposes independent note origins', () => {
        const guides = AudioSpectrogramElement.getConfigSchema()
            .tabs.flatMap((tab) => tab.groups)
            .find((group) => group.id === 'guides');

        expect(guides?.layout?.map((node) => (node.kind === 'section' ? node.id : null))).toEqual([
            'frequency-guides',
            'time-guides',
            'guide-appearance',
        ]);
        expect(guides?.properties.map((property) => property.key)).toEqual(
            expect.arrayContaining([
                'octaveGuideStartNote',
                'noteGuideStartNote',
                'showGuideLabels',
                'showBarGuides',
                'barGuideColor',
            ])
        );
    });
});

describe('audio spectrogram analysis settings', () => {
    it('keeps legacy scenes on the default profile until an override is selected', () => {
        const analysis = resolveSpectrogramAnalysis({});
        expect(analysis.analysisProfileId).toBe('default');
        expect(analysis.requirement.profileParams).toBeUndefined();
    });

    it('creates a stable derived profile from window and hop values', () => {
        const analysis = resolveSpectrogramAnalysis({
            analysisWindowSize: '2048',
            analysisHopSize: '2048',
        });
        expect(analysis.analysisProfileId).toMatch(/^adhoc-/);
        expect(analysis.requirement.profileParams).toEqual({
            windowSize: 2048,
            hopSize: 2048,
        });
    });

    it('exposes curated controls in a dedicated analysis group', () => {
        const analysis = AudioSpectrogramElement.getConfigSchema()
            .tabs.flatMap((tab) => tab.groups)
            .find((group) => group.id === 'analysis');
        expect(analysis?.properties.map((property) => property.key)).toEqual(['analysisWindowSize', 'analysisHopSize']);
    });
});
