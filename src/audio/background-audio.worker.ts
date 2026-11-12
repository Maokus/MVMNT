/// <reference lib="webworker" />
import { analyzeAudioBufferFeatures } from './features/audioFeatureAnalysis';
import { extractPeaks } from './waveform/peak-extractor';
import type { AudioTask } from './background-audio';
import { getSharedTimingManager } from '@state/timeline/timelineShared';

let channels: Float32Array[] = [];
let sampleRate = 48000;
let task: AudioTask;

function transferBuffers(value: unknown, buffers = new Set<ArrayBuffer>()): ArrayBuffer[] {
    if (ArrayBuffer.isView(value)) buffers.add(value.buffer as ArrayBuffer);
    else if (value && typeof value === 'object')
        for (const item of Object.values(value)) transferBuffers(item, buffers);
    return [...buffers];
}

self.onmessage = async ({ data }) => {
    try {
        if (data.kind === 'init') {
            task = data.task;
            sampleRate = data.sampleRate;
            channels = Array.from({ length: data.channels }, () => new Float32Array(data.length));
            self.postMessage({ kind: 'ready' });
        } else if (data.kind === 'chunk') {
            channels[data.channel].set(data.samples, data.offset);
            self.postMessage({ kind: 'ready' });
        } else if (data.kind === 'run') {
            const buffer = {
                length: channels[0]?.length ?? 0,
                numberOfChannels: channels.length,
                sampleRate,
                duration: (channels[0]?.length ?? 0) / sampleRate,
                getChannelData: (channel: number) => channels[channel],
            } as AudioBuffer;
            if (task.kind === 'features') getSharedTimingManager().setTicksPerQuarter(task.ticksPerQuarter);
            const result =
                task.kind === 'peaks'
                    ? extractPeaks(buffer, task.options)
                    : await analyzeAudioBufferFeatures({
                          ...task.options,
                          audioBuffer: buffer,
                          onProgress: (value, label) => self.postMessage({ kind: 'progress', value, label }),
                      });
            self.postMessage({ result }, transferBuffers(result));
            channels = [];
        }
    } catch (error) {
        channels = [];
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
