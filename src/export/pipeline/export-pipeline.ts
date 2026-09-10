import type {
    ExportEnvironment,
    ExportOutputSession,
    ExportPipelineResult,
    ExportProgress,
    ResolvedExportPlan,
} from '../contracts';
import { VideoEncodingStage } from './video-encoding-stage';
import { canvasToPngBlob, renderFrameSequence, withExportSurface } from './frame-driver';

export type ExportReporter = (event: ExportProgress) => void;

export class ExportPipeline {
    async run(
        plan: ResolvedExportPlan,
        environment: ExportEnvironment,
        output: ExportOutputSession,
        signal: AbortSignal,
        report: ExportReporter = () => undefined
    ): Promise<ExportPipelineResult> {
        const release = environment.renderer.beginSimulationExport?.();
        try {
            return await this.runSession(plan, environment, output, signal, report);
        } finally {
            release?.();
        }
    }

    private async runSession(
        plan: ResolvedExportPlan,
        environment: ExportEnvironment,
        output: ExportOutputSession,
        signal: AbortSignal,
        report: ExportReporter = () => undefined
    ): Promise<ExportPipelineResult> {
        report({ progress: 0, text: 'Loading fonts…', stage: 'preparing' });
        await environment.prepare();
        if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');

        if (plan.kind === 'png') return this.runPng(plan, environment, output, signal, report);
        if (!output.videoTarget) throw new Error('Video export requires a streaming output target.');

        const artifacts: ExportPipelineResult['artifacts'] = [];
        const exporter = new VideoEncodingStage(environment.canvas, environment.renderer);
        const result = await exporter.run({
            fps: plan.settings.fps,
            width: plan.settings.width,
            height: plan.settings.height,
            sceneName: plan.sceneName,
            startTick: environment.secondsToTicks(plan.startSeconds),
            endTick: environment.secondsToTicks(plan.endSeconds),
            includeAudio: plan.settings.includeAudio,
            videoCodec: plan.settings.videoCodec,
            videoBitrateMode: 'manual',
            videoBitrate: plan.settings.videoBitrate,
            audioCodec: plan.settings.audioCodec,
            audioBitrate: plan.settings.audioBitrate,
            audioSampleRate: plan.settings.audioSampleRate,
            audioChannels: plan.settings.audioChannels,
            container: plan.settings.container,
            outputTarget: output.videoTarget,
            signal,
            exportAudioMaster: plan.settings.exportAudioMaster,
            exportAudioStems: plan.settings.exportAudioStems,
            audioWavBitDepth: plan.settings.audioWavBitDepth,
            normalizeAudio: plan.settings.normalizeAudio,
            transparentBackground: plan.settings.transparentBackground,
            onProgress: (progress, text = 'Exporting…') =>
                report({
                    progress,
                    text,
                    stage: progress >= 92 ? 'finalizing' : progress >= 8 ? 'rendering' : 'preparing',
                }),
        });
        artifacts.push(...result.artifacts);
        return {
            frameCount: result.frameCount,
            durationSeconds: result.durationSeconds,
            artifacts,
            reproducibilityHash: result.reproducibilityHash,
            mixPeak: result.mixPeak,
        };
    }

    private async runPng(
        plan: ResolvedExportPlan,
        environment: ExportEnvironment,
        output: ExportOutputSession,
        signal: AbortSignal,
        report: ExportReporter
    ): Promise<ExportPipelineResult> {
        await withExportSurface(environment, plan, async () => {
            await renderFrameSequence(
                environment,
                plan,
                signal,
                async (frameIndex) => {
                    const outputFrame = plan.startFrame + frameIndex;
                    const filename = `frame_${String(outputFrame).padStart(6, '0')}.png`;
                    await output.writeFrame(filename, await canvasToPngBlob(environment.canvas));
                },
                (completed) =>
                    report({
                        progress: (completed / plan.frameCount) * 95,
                        text: 'Rendering PNG frames…',
                        stage: 'rendering',
                    })
            );
        });
        report({ progress: 100, text: 'Image sequence ready', stage: 'finalizing' });
        return { frameCount: plan.frameCount, durationSeconds: plan.durationSeconds, artifacts: [] };
    }
}
