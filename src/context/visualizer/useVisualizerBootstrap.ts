import { useEffect } from 'react';
import { MIDIVisualizerCore } from '@core/visualizer-core.js';
import { ImageSequenceGenerator } from '@export/image-sequence-generator.js';
import { VideoExporter } from '@export/video-exporter.js';
import '@export/av-exporter.js';
import { useSceneStore } from '@state/sceneStore';
import type { ExportSettings } from './types';

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
        if (canvasRef.current && !visualizer) {
            const vis = new MIDIVisualizerCore(canvasRef.current);
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
        }
    }, [canvasRef, visualizer, setVisualizer, setImageSequenceGenerator, setVideoExporter, setExportSettings]);
}
