// Phase 5: Waveform peak extraction utility
// Provides a synchronous (chunked) downsampling of an AudioBuffer into peak bins for fast waveform rendering.
// Strategy:
//  - Choose a target number of samples per peak bin (binSizeSamples) ~ 512 or 1024.
//  - For each channel, compute min & max within the bin; store interleaved or merged. For simplicity we store max absolute amplitude per bin (mono representation).
//  - Return Float32Array of length = numberOfBins with values in [0,1].
//  - If buffer length < binSizeSamples * 8 (very small), we directly sample absolute values at stride to avoid heavy loops.
//  - All math is deterministic.

export interface PeakExtractionOptions {
    binSize?: number; // preferred bin size in source samples (default 1024)
    maxBins?: number; // cap number of bins (default 4096)
    channelMode?: 'mono-abs-max' | 'separate'; // MVP only implements mono-abs-max
}

export interface PeakExtractionResult {
    peaks: Float32Array; // normalized 0..1 absolute peak per bin
    binSize: number; // actual bin size used
    sampleRate: number;
}

export function extractPeaks(buffer: AudioBuffer, opts: PeakExtractionOptions = {}): PeakExtractionResult {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    if (length === 0) return { peaks: new Float32Array(0), binSize: 0, sampleRate: buffer.sampleRate };
    const binSizeDefault = opts.binSize && opts.binSize > 16 ? opts.binSize : 1024;
    const maxBins = opts.maxBins && opts.maxBins > 16 ? opts.maxBins : 4096;
    // Derive number of bins: floor(length/binSize) but capped by maxBins; adjust binSize upward if we exceed cap.
    let binSize = binSizeDefault;
    let bins = Math.ceil(length / binSize);
    if (bins > maxBins) {
        // Increase binSize to reduce bins to <= maxBins
        binSize = Math.ceil(length / maxBins);
        bins = Math.ceil(length / binSize);
    }
    const peaks = new Float32Array(bins);
    const tmp: Float32Array[] = [];
    for (let c = 0; c < channels; c++) tmp.push(buffer.getChannelData(c));

    for (let b = 0; b < bins; b++) {
        const start = b * binSize;
        let end = start + binSize;
        if (end > length) end = length;
        let peak = 0;
        for (let i = start; i < end; i++) {
            // Aggregate absolute max across all channels
            for (let c = 0; c < channels; c++) {
                const v = Math.abs(tmp[c][i]);
                if (v > peak) peak = v;
            }
        }
        peaks[b] = peak; // already 0..1 (assuming buffer data normalized)
    }

    return { peaks, binSize, sampleRate: buffer.sampleRate };
}

// Helper to compute peaks in small time slices to avoid blocking UI >16ms. Returns promise resolved when done.
export async function extractPeaksAsync(
    buffer: AudioBuffer,
    opts: PeakExtractionOptions = {},
    chunkMillis = 8
): Promise<PeakExtractionResult> {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    if (length === 0) return { peaks: new Float32Array(0), binSize: 0, sampleRate: buffer.sampleRate };
    const binSizeDefault = opts.binSize && opts.binSize > 16 ? opts.binSize : 1024;
    const maxBins = opts.maxBins && opts.maxBins > 16 ? opts.maxBins : 4096;
    let binSize = binSizeDefault;
    let bins = Math.ceil(length / binSize);
    if (bins > maxBins) {
        binSize = Math.ceil(length / maxBins);
        bins = Math.ceil(length / binSize);
    }
    const peaks = new Float32Array(bins);
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

    let b = 0;
    while (b < bins) {
        const sliceStartTime = performance.now();
        while (b < bins && performance.now() - sliceStartTime < chunkMillis) {
            const start = b * binSize;
            let end = start + binSize;
            if (end > length) end = length;
            let peak = 0;
            for (let i = start; i < end; i++) {
                for (let c = 0; c < channels; c++) {
                    const v = Math.abs(channelData[c][i]);
                    if (v > peak) peak = v;
                }
            }
            peaks[b] = peak;
            b++;
        }
        if (b < bins) await new Promise((r) => setTimeout(r, 0));
    }
    return { peaks, binSize, sampleRate: buffer.sampleRate };
}
