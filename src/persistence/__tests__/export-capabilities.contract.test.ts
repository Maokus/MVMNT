import { describe, expect, it } from 'vitest';
import { serializeTimelineTracks } from '../export/documentShaping';
import { buildCompatibilityWarnings, toPluginVersionRange } from '../export/manifestEmission';

describe('export capability contracts', () => {
    it('shapes audio tracks without legacy track or clip placement fields', () => {
        const tracks = serializeTimelineTracks({
            audio: {
                id: 'audio',
                type: 'audio',
                offsetTicks: 10,
                audioSourceId: 'legacy',
                clips: [{ id: 'clip', sourceId: 'source', regionStartTick: 1, regionEndTick: 2 }],
            },
        });
        expect(tracks.audio.offsetTicks).toBeUndefined();
        expect(tracks.audio.audioSourceId).toBeUndefined();
        expect(tracks.audio.clips[0]).toEqual({ id: 'clip', sourceId: 'source' });
    });

    it('emits compatibility manifest values independently of store wiring', () => {
        expect(toPluginVersionRange('2.4.7')).toBe('^2.4.0');
        expect(toPluginVersionRange('development')).toBe('development');
        expect(buildCompatibilityWarnings([])).toBeUndefined();
        expect(buildCompatibilityWarnings(['missing asset'])).toEqual({ warnings: [{ message: 'missing asset' }] });
    });
});
