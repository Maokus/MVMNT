import { describe, expect, it } from 'vitest';
import { isAnalyticsEventName, validateAnalyticsEvent } from '../analytics/schema';

describe('analytics runtime event schema', () => {
    it('accepts only reviewed event names and exact property sets', () => {
        expect(isAnalyticsEventName('document_saved')).toBe(true);
        expect(isAnalyticsEventName('$pageview')).toBe(false);
        expect(validateAnalyticsEvent('$pageview' as never, {})).toBeNull();
        expect(validateAnalyticsEvent('document_saved', { save_mode: 'save' })).toEqual({ save_mode: 'save' });
        expect(
            validateAnalyticsEvent('document_saved', { save_mode: 'save', filename: 'private-project.mvt' })
        ).toBeNull();
    });

    it('rejects invalid categorical, numeric, and identifier-like values', () => {
        expect(validateAnalyticsEvent('screen_viewed', { screen: '/workspace?project=private' })).toBeNull();
        expect(validateAnalyticsEvent('community_item_rated', { rating: 0 })).toBeNull();
        expect(validateAnalyticsEvent('community_item_rated', { rating: 6 })).toBeNull();
        expect(validateAnalyticsEvent('community_item_rated', { rating: 4.5 })).toBeNull();
        expect(validateAnalyticsEvent('scene_element_added', { element_type: 'author/private-plugin' })).toBeNull();
    });

    it('accepts reviewed safe values', () => {
        expect(validateAnalyticsEvent('community_item_rated', { rating: 5 })).toEqual({ rating: 5 });
        expect(validateAnalyticsEvent('scene_element_added', { element_type: 'audio-spectrum' })).toEqual({
            element_type: 'audio-spectrum',
        });
        expect(
            validateAnalyticsEvent('export_started', {
                export_format: 'video',
                includes_audio: true,
                transparent_background: false,
                execution_mode: 'background',
            })
        ).toEqual({
            export_format: 'video',
            includes_audio: true,
            transparent_background: false,
            execution_mode: 'background',
        });
    });
});
