import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPeaksInBackground } from '../background-audio';

class AudioWorker {
    static instances: AudioWorker[] = [];
    static respond = true;
    onmessage: ((event: { data: any }) => void) | null = null;
    onerror: ((event: { message: string }) => void) | null = null;
    terminate = vi.fn();
    messages: { message: any; transfer?: Transferable[] }[] = [];
    constructor() {
        AudioWorker.instances.push(this);
    }
    postMessage(message: any, transfer?: Transferable[]) {
        this.messages.push({ message, transfer });
        if (!AudioWorker.respond) return;
        if (message.kind === 'run')
            queueMicrotask(() =>
                this.onmessage?.({
                    data: { result: { peaks: new Float32Array([0.5]), binSize: 1024, sampleRate: 48000 } },
                })
            );
        else queueMicrotask(() => this.onmessage?.({ data: { kind: 'ready' } }));
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    AudioWorker.instances = [];
    AudioWorker.respond = true;
});

describe('background audio preparation', () => {
    it('transfers bounded copies and preserves the decoded playback channels', async () => {
        vi.stubGlobal('Worker', AudioWorker);
        const samples = new Float32Array(600_000).fill(0.5);
        const buffer = {
            length: samples.length,
            numberOfChannels: 1,
            sampleRate: 48000,
            getChannelData: () => samples,
        } as unknown as AudioBuffer;
        const result = await extractPeaksInBackground(buffer);
        const worker = AudioWorker.instances[0];
        const chunks = worker.messages.filter(({ message }) => message.kind === 'chunk');
        expect(chunks).toHaveLength(3);
        expect(chunks.every(({ message }) => message.samples.byteLength <= 1024 * 1024)).toBe(true);
        expect(chunks.every(({ transfer }) => transfer?.[0] !== samples.buffer)).toBe(true);
        expect(samples[599_999]).toBe(0.5);
        expect(result.peaks[0]).toBe(0.5);
        expect(worker.terminate).toHaveBeenCalledOnce();
    });

    it('terminates an active worker on cancellation', async () => {
        vi.stubGlobal('Worker', AudioWorker);
        AudioWorker.respond = false;
        const controller = new AbortController();
        const buffer = {
            length: 100,
            numberOfChannels: 1,
            sampleRate: 48000,
            getChannelData: () => new Float32Array(100),
        } as unknown as AudioBuffer;
        const pending = extractPeaksInBackground(buffer, {}, controller.signal);
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(AudioWorker.instances).toHaveLength(1));
        controller.abort();
        await rejected;
        expect(AudioWorker.instances[0].terminate).toHaveBeenCalledOnce();
    });
});
