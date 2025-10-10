import { useEffect } from 'react';
import type { VideoExporter } from '@export/video-exporter.js';
import { useSceneStore } from '@state/sceneStore';
import { isCanvasRendererAllowed } from '@utils/renderEnvironment';
import type { ExportSettings } from './types';

type VisualizerModules = {
    MIDIVisualizerCore: typeof import('@core/visualizer-core.js').MIDIVisualizerCore;
    ImageSequenceGenerator: typeof import('@export/image-sequence-generator.js').ImageSequenceGenerator;
    VideoExporter: typeof import('@export/video-exporter.js').VideoExporter;
};

let visualizerModulesPromise: Promise<VisualizerModules> | null = null;

const loadVisualizerModules = async (): Promise<VisualizerModules> => {
    if (!visualizerModulesPromise) {
        visualizerModulesPromise = (async () => {
            const [core, sequence, video] = await Promise.all([
                import('@core/visualizer-core.js'),
                import('@export/image-sequence-generator.js'),
                import('@export/video-exporter.js'),
                import('@export/av-exporter.js'),
            ]);
            return {
                MIDIVisualizerCore: core.MIDIVisualizerCore,
                ImageSequenceGenerator: sequence.ImageSequenceGenerator,
                VideoExporter: video.VideoExporter,
            };
        })();
    }
    return visualizerModulesPromise;
};

interface UseVisualizerBootstrapArgs {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    visualizer: any | null;
    setVisualizer: (visualizer: any) => void;
    setImageSequenceGenerator: (generator: any) => void;
    setVideoExporter: (exporter: VideoExporter | null) => void;
    setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
    sceneNameRef: React.MutableRefObject<string>;
    setSceneNameState: React.Dispatch<React.SetStateAction<string>>;
}

export function useVisualizerBootstrap({
    canvasRef,
    visualizer,
    setVisualizer,
    setImageSequenceGenerator,
    setVideoExporter,
    setExportSettings,
    sceneNameRef,
    setSceneNameState,
}: UseVisualizerBootstrapArgs) {
    useEffect(() => {
        const handler = (e: any) => {
            if (e?.detail?.sceneName) {
                sceneNameRef.current = e.detail.sceneName;
                setSceneNameState(e.detail.sceneName);
            }
        };
        window.addEventListener('scene-name-changed', handler as EventListener);
        return () => window.removeEventListener('scene-name-changed', handler as EventListener);
    }, [sceneNameRef, setSceneNameState]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || visualizer) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { MIDIVisualizerCore, ImageSequenceGenerator, VideoExporter } = await loadVisualizerModules();
                if (cancelled || !canvasRef.current) {
                    return;
                }
                const vis = new MIDIVisualizerCore(canvasRef.current, null, {
                    allowCanvasFallback: isCanvasRendererAllowed(),
                });
                vis.render();
                setVisualizer(vis);
                const gen = new ImageSequenceGenerator(canvasRef.current, vis);
                setImageSequenceGenerator(gen);
                const vid = new VideoExporter(canvasRef.current, vis);
                setVideoExporter(vid);
                (window as any).debugVisualizer = vis;
                try {
                    const settings = useSceneStore.getState().settings;
                    setExportSettings((prev) => ({
                        ...prev,
                        fps: settings.fps ?? prev.fps,
                        width: settings.width ?? prev.width,
                        height: settings.height ?? prev.height,
                    }));
                } catch {
                    /* ignore */
                }
            } catch (error) {
                console.error('Failed to load visualizer modules', error);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [canvasRef, visualizer, setVisualizer, setImageSequenceGenerator, setVideoExporter, setExportSettings]);
}
