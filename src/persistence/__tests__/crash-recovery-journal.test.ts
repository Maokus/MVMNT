import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from '@state/timelineStore';
import {
    checkpointCrashRecoveryJournal,
    clearCrashRecoveryJournal,
    loadCrashRecoveryJournal,
    recoverFromCrashRecoveryJournal,
} from '@persistence/crash-recovery-journal';

function makeBuffer(): AudioBuffer {
    return {
        length: 100,
        numberOfChannels: 2,
        duration: 1,
        sampleRate: 100,
        getChannelData: () => new Float32Array(100),
    } as unknown as AudioBuffer;
}

describe('crash recovery journal', () => {
    beforeEach(async () => {
        await clearCrashRecoveryJournal();
        useTimelineStore.getState().resetTimeline();
    });

    it('recovers timeline tracks and audio source references without decoded buffers', async () => {
        useTimelineStore.setState({
            tracks: {
                audio1: {
                    id: 'audio1',
                    name: 'Recovered Audio',
                    type: 'audio',
                    enabled: true,
                    mute: false,
                    solo: false,
                    offsetTicks: 0,
                    gain: 1,
                    audioSourceId: 'audio1',
                },
            },
            tracksOrder: ['audio1'],
            audioCache: {
                audio1: {
                    audioBuffer: makeBuffer(),
                    durationTicks: 960,
                    sampleRate: 100,
                    channels: 2,
                    durationSeconds: 1,
                    durationSamples: 100,
                    originalFile: {
                        name: 'audio.wav',
                        mimeType: 'audio/wav',
                        byteLength: 4,
                        bytes: new Uint8Array([1, 2, 3, 4]),
                        storage: 'inline',
                    },
                    decodedState: 'ready',
                },
            },
        } as any);

        await checkpointCrashRecoveryJournal('test');
        const snapshot = await loadCrashRecoveryJournal();
        expect(snapshot).toBeTruthy();

        useTimelineStore.getState().resetTimeline();
        await recoverFromCrashRecoveryJournal(snapshot!);

        const state = useTimelineStore.getState();
        expect(state.tracksOrder).toEqual(['audio1']);
        expect(state.tracks.audio1?.name).toBe('Recovered Audio');
        expect(state.audioCache.audio1.audioBuffer).toBeUndefined();
        expect(state.audioCache.audio1.decodedState).toBe('evicted');
        expect(state.audioCache.audio1.originalFile?.assetId).toBeTruthy();
    });
});
