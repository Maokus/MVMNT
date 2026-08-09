import { useEffect } from 'react';
import { useSceneStore } from '@state/sceneStore';
import type { ExportSettings } from '@export/contracts';

type VisualizerModules = {
    MIDIVisualizerCore: typeof import('@core/visualizer-core.js').MIDIVisualizerCore;
};

let visualizerModulesPromise: Promise<VisualizerModules> | null = null;

const loadVisualizerModules = async (): Promise<VisualizerModules> => {
    if (!visualizerModulesPromise) {
        visualizerModulesPromise = (async () => {
            const core = await import('@core/visualizer-core.js');
            return {
                MIDIVisualizerCore: core.MIDIVisualizerCore,
            };
        })();
    }
    return visualizerModulesPromise;
};

interface UseVisualizerBootstrapArgs {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    setVisualizer: (visualizer: any) => void;
    setExportSettings: React.Dispatch<React.SetStateAction<ExportSettings>>;
    sceneNameRef: React.MutableRefObject<string>;
    setSceneNameState: React.Dispatch<React.SetStateAction<string>>;
}

export function useVisualizerBootstrap({
    canvasRef,
    setVisualizer,
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
        if (!canvas) {
            return;
        }
        let cancelled = false;
        let createdVisualizer: InstanceType<VisualizerModules['MIDIVisualizerCore']> | null = null;
        (async () => {
            try {
                const { MIDIVisualizerCore } = await loadVisualizerModules();
                if (cancelled || !canvasRef.current) {
                    return;
                }
                const vis = new MIDIVisualizerCore(canvasRef.current);
                createdVisualizer = vis;
                if (cancelled) {
                    vis.cleanup();
                    return;
                }
                vis.render();
                setVisualizer(vis);
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
            createdVisualizer?.cleanup();
            createdVisualizer = null;
        };
    }, [canvasRef, setVisualizer, setExportSettings]);
}
