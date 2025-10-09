export interface FftPlanStage {
    size: number;
    halfSize: number;
    cos: Float32Array;
    sin: Float32Array;
}

export interface FftPlan {
    size: number;
    stages: FftPlanStage[];
}

export function createFftPlan(size: number): FftPlan {
    if (size <= 0 || (size & (size - 1)) !== 0) {
        throw new Error('FFT size must be a power of two');
    }
    const stages: FftPlanStage[] = [];
    for (let stageSize = 2; stageSize <= size; stageSize <<= 1) {
        const halfSize = stageSize >> 1;
        const cos = new Float32Array(halfSize);
        const sin = new Float32Array(halfSize);
        const theta = (-2 * Math.PI) / stageSize;
        for (let k = 0; k < halfSize; k++) {
            const angle = theta * k;
            cos[k] = Math.cos(angle);
            sin[k] = Math.sin(angle);
        }
        stages.push({ size: stageSize, halfSize, cos, sin });
    }
    return { size, stages };
}

export function fftRadix2(real: Float32Array, imag: Float32Array, plan: FftPlan): void {
    const { size, stages } = plan;
    if (real.length !== size || imag.length !== size) {
        throw new Error('FFT buffers must match plan size');
    }

    // Bit-reversal permutation.
    for (let i = 1, j = 0; i < size; i++) {
        let bit = size >> 1;
        for (; (j & bit) !== 0; bit >>= 1) {
            j &= ~bit;
        }
        j |= bit;
        if (i < j) {
            const tempReal = real[i];
            real[i] = real[j];
            real[j] = tempReal;
            const tempImag = imag[i];
            imag[i] = imag[j];
            imag[j] = tempImag;
        }
    }

    for (const stage of stages) {
        const { size: stageSize, halfSize, cos, sin } = stage;
        for (let start = 0; start < size; start += stageSize) {
            for (let k = 0; k < halfSize; k++) {
                const evenIndex = start + k;
                const oddIndex = evenIndex + halfSize;
                const twiddleReal = cos[k];
                const twiddleImag = sin[k];
                const oddReal = real[oddIndex];
                const oddImag = imag[oddIndex];
                const tReal = twiddleReal * oddReal - twiddleImag * oddImag;
                const tImag = twiddleReal * oddImag + twiddleImag * oddReal;
                real[oddIndex] = real[evenIndex] - tReal;
                imag[oddIndex] = imag[evenIndex] - tImag;
                real[evenIndex] += tReal;
                imag[evenIndex] += tImag;
            }
        }
    }
}
