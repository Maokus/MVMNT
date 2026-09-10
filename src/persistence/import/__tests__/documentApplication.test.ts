import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '@audio/audio-engine';
import { TransportCoordinator } from '@audio/transport-coordinator';
import { DocumentGateway } from '@persistence/document-gateway';
import { applyImportedDocument } from '@persistence/import/documentApplication';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { DocumentApplyError } from '@persistence/document-gateway';

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

    it('rolls every document domain back when scene application fails', () => {
        useTimelineStore.setState((state) => ({
            timeline: { ...state.timeline, globalBpm: 111 },
        }));
        const before = DocumentGateway.build({ includeEphemeral: true });
        const incoming = DocumentGateway.build({ includeEphemeral: true });
        incoming.timeline = { ...incoming.timeline, globalBpm: 177 };
        const importScene = vi.spyOn(useSceneStore.getState(), 'importScene');
        importScene.mockImplementationOnce(() => {
            throw new Error('rejected scene');
        });

        expect(() => applyImportedDocument(incoming as any, new Map(), undefined, undefined)).toThrow(
            DocumentApplyError
        );
        expect(useTimelineStore.getState().timeline.globalBpm).toBe(before.timeline.globalBpm);
        importScene.mockRestore();
    });
});
