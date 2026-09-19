/** Peak envelopes use source samples, including the shorter final overview bin. */
export function getOverviewPeak(peaks: Float32Array, sampleStep: number, start: number, end: number): number {
    if (sampleStep <= 0 || end <= start) return 0;
    const first = Math.max(0, Math.floor(start / sampleStep));
    const last = Math.min(peaks.length, Math.ceil(end / sampleStep));
    let peak = 0;
    for (let i = first; i < last; i++) peak = Math.max(peak, peaks[i]);
    return peak;
}

const TILE_BINS = 1024;
type Consumer = { invalidate: () => void; isCurrent: () => boolean };
type Job = { consumers: Map<() => void, Consumer>; run: () => Promise<void> };

/** Shared, disposable detail tiles. Cache entries do not retain decoded audio buffers. */
export class WaveformDetailCache {
    private identities = new WeakMap<AudioBuffer, number>();
    private nextId = 0;
    private tiles = new Map<string, Float32Array>();
    private jobs = new Map<string, Job>();
    private running = false;
    private bytes = 0;

    constructor(private readonly maxBytes = 32 * 1024 * 1024) {}

    get byteLength() {
        return this.bytes;
    }

    private identity(buffer: AudioBuffer) {
        let id = this.identities.get(buffer);
        if (id === undefined) {
            id = ++this.nextId;
            this.identities.set(buffer, id);
        }
        return id;
    }

    private async drain() {
        if (this.running) return;
        this.running = true;
        try {
            while (this.jobs.size) {
                const [key, job] = this.jobs.entries().next().value!;
                await job.run();
                this.jobs.delete(key);
            }
        } finally {
            this.running = false;
        }
    }

    private request(buffer: AudioBuffer, step: number, tileIndex: number, consumer: Consumer) {
        const key = `${this.identity(buffer)}:${step}:${tileIndex}`;
        const cached = this.tiles.get(key);
        if (cached) {
            this.tiles.delete(key);
            this.tiles.set(key, cached);
            return cached;
        }
        const existing = this.jobs.get(key);
        if (existing) {
            existing.consumers.set(consumer.invalidate, consumer);
            return;
        }
        const consumers = new Map([[consumer.invalidate, consumer]]);
        const current = () => [...consumers.values()].some((entry) => entry.isCurrent());
        const run = async () => {
            if (!current()) return;
            const firstSample = tileIndex * TILE_BINS * step;
            const binCount = Math.min(TILE_BINS, Math.ceil((buffer.length - firstSample) / step));
            if (binCount <= 0) return;
            const values = new Float32Array(binCount);
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
            let sliceStart = performance.now();
            for (let bin = 0; bin < binCount; bin++) {
                const start = firstSample + bin * step;
                const end = Math.min(buffer.length, start + step);
                let peak = 0;
                for (let sample = start; sample < end; sample++) {
                    for (const channel of channels) peak = Math.max(peak, Math.abs(channel[sample]));
                    if ((sample & 4095) === 0 && performance.now() - sliceStart >= 4) {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                        if (!current()) return;
                        sliceStart = performance.now();
                    }
                }
                values[bin] = peak;
            }
            if (!current()) return;
            while (this.bytes + values.byteLength > this.maxBytes && this.tiles.size) {
                const [oldKey, oldValues] = this.tiles.entries().next().value!;
                this.tiles.delete(oldKey);
                this.bytes -= oldValues.byteLength;
            }
            if (values.byteLength <= this.maxBytes) {
                this.tiles.set(key, values);
                this.bytes += values.byteLength;
                for (const entry of consumers.values()) if (entry.isCurrent()) entry.invalidate();
            }
            // Yield between tiles even when individual tiles are cheap.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        };
        this.jobs.set(key, { consumers, run });
        // Defer work until all pixels have registered their requests.
        void Promise.resolve().then(() => this.drain());
    }

    read(buffer: AudioBuffer, startSample: number, endSample: number, consumer: Consumer): number | undefined {
        const start = Math.max(0, Math.min(buffer.length, startSample));
        const end = Math.max(start, Math.min(buffer.length, endSample));
        if (end <= start) return 0;
        // At most a quarter-pixel of bin uncertainty; step 1 retains individual samples.
        const step = 2 ** Math.max(0, Math.floor(Math.log2((end - start) / 4)));
        const firstBin = Math.floor(start / step);
        const lastBin = Math.ceil(end / step);
        let peak = 0;
        let ready = true;
        for (
            let tileIndex = Math.floor(firstBin / TILE_BINS);
            tileIndex < Math.ceil(lastBin / TILE_BINS);
            tileIndex++
        ) {
            const tile = this.request(buffer, step, tileIndex, consumer);
            if (!tile) {
                ready = false;
                continue;
            }
            const first = Math.max(0, firstBin - tileIndex * TILE_BINS);
            const last = Math.min(tile.length, lastBin - tileIndex * TILE_BINS);
            for (let bin = first; bin < last; bin++) peak = Math.max(peak, tile[bin]);
        }
        return ready ? peak : undefined;
    }
}

export const waveformDetailCache = new WaveformDetailCache();
