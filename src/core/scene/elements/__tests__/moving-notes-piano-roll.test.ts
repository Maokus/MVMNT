import { describe, it, expect, vi, afterEach } from 'vitest';
import { MovingNotesPianoRollElement } from '@core/scene/elements/midi-displays/moving-notes-piano-roll/moving-notes-piano-roll';

describe('MovingNotesPianoRollElement bindings', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('provides a default binding for midiTrackIds without logging warnings', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const element = new MovingNotesPianoRollElement('test-moving-notes');
        try {
            const value = (element as any).getProperty('midiTrackIds');
            expect(Array.isArray(value)).toBe(true);
            expect(value.length).toBe(0);
            expect((element as any).bindings?.has('midiTrackIds')).toBe(true);
            expect(warnSpy).not.toHaveBeenCalledWith(
                expect.stringContaining("No binding found for property 'midiTrackIds'")
            );
        } finally {
            element.dispose?.();
            warnSpy.mockRestore();
        }
    });
});
