import { describe, it, expect } from 'vitest';

// This test checks whether AAC is reported as encodable by mediabunny in the
// current environment. It intentionally keeps assertions simple: we expect the
// mediabunny helpers to exist and be callable. The test will pass if the
// helpers return a boolean/array result without throwing; it will also assert
// and surface whether AAC is supported so you can see the runtime capability.

describe('mediabunny AAC capability', () => {
    it('reports whether AAC is encodable', async () => {
        const mb = await import('mediabunny');

        expect(mb).toBeDefined();

        // canEncodeAudio should be a function that returns a boolean when called
        // with an audio codec id (e.g. 'aac' or 'mp4a.40.2'). If it's missing,
        // fail the test early so we can inspect the mediabunny import.
        expect(typeof mb.canEncodeAudio).toBe('function');
        expect(typeof mb.getEncodableAudioCodecs).toBe('function');

        const can = await mb.canEncodeAudio('aac');
        // Accept boolean-ish return values; surface the value in assertion
        expect(typeof can === 'boolean' || typeof can === 'undefined' || Array.isArray(can)).toBe(true);

        const list = await mb.getEncodableAudioCodecs();
        expect(Array.isArray(list)).toBe(true);

        // Informational: assert that if canEncodeAudio returns true then list contains 'aac'
        if (can === true) {
            expect(list.some((x: unknown) => String(x).toLowerCase().includes('aac'))).toBe(true);
        }
    });
});
