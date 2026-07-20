import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveDiagnosticsSection } from '../PerspectiveDiagnosticsSection';

describe('PerspectiveDiagnosticsSection', () => {
    it('renders outside VisualizerProvider and reads diagnostics defensively', () => {
        const runtimeWindow = window as typeof window & { vis?: { getPerspectiveDiagnostics: () => unknown } };
        runtimeWindow.vis = {
            getPerspectiveDiagnostics: () => ({
                warpedElements: 2,
                fallbackElements: 1,
                sourcePixels: 100,
                projectedPixels: 80,
                uploadedBytes: 400,
                sourceRasterMs: 1,
                gpuSubmissionMs: 2,
                canvasCompositeMs: 3,
                gpuExecutionMs: null,
                medianFrameCpuMs: 6,
                p95FrameCpuMs: 9,
                sampleCount: 10,
                surfaceReallocations: 1,
                contextLossEvents: 0,
            }),
        };

        render(<PerspectiveDiagnosticsSection open onToggle={vi.fn()} />);

        expect(screen.getByText('Perspective Warp')).toBeInTheDocument();
        expect(screen.getByText(/2 warped · 1 fallback/)).toBeInTheDocument();
        delete runtimeWindow.vis;
    });
});
