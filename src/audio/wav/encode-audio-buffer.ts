/**
 * Encode an AudioBuffer into a 32-bit float PCM WAV byte stream.
 * Preserves channel count and sample rate; data is interleaved frame-by-frame.
 */
export function encodeAudioBufferToWavFloat32(buffer: AudioBuffer): Uint8Array {
    const numChannels = buffer.numberOfChannels || 1;
    const sampleRate = buffer.sampleRate || 44100;
    const numFrames = buffer.length || 0;
    const bytesPerSample = 4; // 32-bit float
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, str: string) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM subchunk size
    view.setUint16(20, 3, true); // audioFormat 3 = IEEE float
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const dataView = new DataView(arrayBuffer, headerSize);
    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
        channelData.push(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));
    }
    let offset = 0;
    for (let i = 0; i < numFrames; i++) {
        for (let c = 0; c < numChannels; c++) {
            const sample = channelData[c][i] ?? 0;
            dataView.setFloat32(offset, sample, true);
            offset += bytesPerSample;
        }
    }

    return new Uint8Array(arrayBuffer);
}
