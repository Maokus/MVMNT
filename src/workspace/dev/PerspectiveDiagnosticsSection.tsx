import React from 'react';
import { Section } from './Section';

const formatPixels = (value: number) =>
    value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)} MP` : `${Math.round(value / 1000)} KP`;
const formatBytes = (value: number) =>
    value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} MB` : `${Math.round(value / 1000)} KB`;
const formatMs = (value: number | null) => (value == null ? 'unavailable' : `${value.toFixed(2)} ms`);

export const PerspectiveDiagnosticsSection: React.FC<{ open: boolean; onToggle: () => void }> = ({
    open,
    onToggle,
}) => {
    const [snapshot, setSnapshot] = React.useState<any>(null);

    React.useEffect(() => {
        if (!open || typeof window === 'undefined') return;
        const update = () => {
            const runtimeWindow = window as typeof window & {
                vis?: { getPerspectiveDiagnostics?: () => unknown };
                debugVisualizer?: { getPerspectiveDiagnostics?: () => unknown };
            };
            const visualizer = runtimeWindow.vis ?? runtimeWindow.debugVisualizer;
            setSnapshot(visualizer?.getPerspectiveDiagnostics?.() ?? null);
        };
        update();
        const timer = window.setInterval(update, 500);
        return () => window.clearInterval(timer);
    }, [open]);

    const subtitle = snapshot
        ? `${snapshot.warpedElements} warped · ${snapshot.fallbackElements} fallback`
        : 'inactive';
    return (
        <Section title="Perspective Warp" open={open} onToggle={onToggle} subtitle={subtitle}>
            {snapshot ? (
                <>
                    <div>
                        Source / projected: {formatPixels(snapshot.sourcePixels)} /{' '}
                        {formatPixels(snapshot.projectedPixels)}
                    </div>
                    <div>Uploaded: {formatBytes(snapshot.uploadedBytes)}</div>
                    <div>
                        CPU raster / submit / composite: {formatMs(snapshot.sourceRasterMs)} /{' '}
                        {formatMs(snapshot.gpuSubmissionMs)} / {formatMs(snapshot.canvasCompositeMs)}
                    </div>
                    <div>GPU execution: {formatMs(snapshot.gpuExecutionMs)}</div>
                    <div>
                        Rolling median / p95: {formatMs(snapshot.medianFrameCpuMs)} / {formatMs(snapshot.p95FrameCpuMs)}{' '}
                        ({snapshot.sampleCount}/120)
                    </div>
                    <div>
                        Reallocations / context losses: {snapshot.surfaceReallocations} / {snapshot.contextLossEvents}
                    </div>
                </>
            ) : (
                <div style={{ opacity: 0.65 }}>No renderer diagnostics available.</div>
            )}
        </Section>
    );
};
