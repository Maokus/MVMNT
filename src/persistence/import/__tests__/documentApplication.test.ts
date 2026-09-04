import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '@audio/audio-engine';
import { TransportCoordinator } from '@audio/transport-coordinator';
import { DocumentGateway } from '@persistence/document-gateway';
import { applyImportedDocument } from '@persistence/import/documentApplication';
import { useTimelineStore } from '@state/timelineStore';

describe('imported document application', () => {
    afterEach(() => {
        useTimelineStore.getState().pause();
    });

    it('stops timeline playback and its audio when a new document is applied', () => {
        const timeline = useTimelineStore.getState();
        timeline.pause();
        const document = DocumentGateway.build();
        const stop = vi.fn();
        const audioEngine = {
            ensureContext: vi.fn(),
            isReady: vi.fn(() => false),
            stop,
        } as unknown as AudioEngine;
        const coordinator = new TransportCoordinator({ audioEngine });

        timeline.play();
        expect(useTimelineStore.getState().transport.isPlaying).toBe(true);

        applyImportedDocument(document, new Map(), undefined, undefined);

        expect(useTimelineStore.getState().transport).toMatchObject({
            isPlaying: false,
            state: 'paused',
        });
        expect(stop).toHaveBeenCalledOnce();
        coordinator.dispose();
    });
});
