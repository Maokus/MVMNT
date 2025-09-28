import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTimelineStore, getSharedTimingManager } from '@state/timelineStore';

interface UseTransportBridgeArgs {
    visualizer: any | null;
    setIsPlaying: Dispatch<SetStateAction<boolean>>;
}

interface TransportBridgeResult {
    playPause: () => void;
    stop: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    forceRender: () => void;
    seekPercent: (percent: number) => void;
}

export function useTransportBridge({ visualizer, setIsPlaying }: UseTransportBridgeArgs): TransportBridgeResult {
    const playPause = useCallback(() => {
        const { togglePlay } = useTimelineStore.getState();
        togglePlay();
    }, []);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.key === ' ') {
                const target = e.target as HTMLElement | null;
                const tag = target?.tagName;
                let isEditing = false;
                if (target) {
                    if (target.isContentEditable) {
                        isEditing = true;
                    } else if (tag === 'TEXTAREA') {
                        isEditing = true;
                    } else if (tag === 'INPUT') {
                        const type = (target as HTMLInputElement).type;
                        const textLike = ['text', 'search', 'url', 'tel', 'email', 'password'];
                        if (textLike.includes(type)) isEditing = true;
                    }
                }
                if (isEditing) return;
                e.preventDefault();
                try {
                    const { togglePlay } = useTimelineStore.getState();
                    togglePlay();
                } catch {}
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    const tIsPlaying = useTimelineStore((s) => s.transport.isPlaying);
    useEffect(() => {
        if (!visualizer) return;
        if (tIsPlaying && !visualizer.isPlaying) {
            const started = visualizer.play?.();
            setIsPlaying(started && !!visualizer.isPlaying);
        } else if (!tIsPlaying && visualizer.isPlaying) {
            visualizer.pause?.();
            setIsPlaying(false);
        }
    }, [visualizer, tIsPlaying, setIsPlaying]);

    const tCurrent = useTimelineStore((s) => {
        const tm = getSharedTimingManager();
        const beats = s.timeline.currentTick / tm.ticksPerQuarter;
        return tm.beatsToSeconds(beats);
    });
    useEffect(() => {
        if (!visualizer) return;
        const vTime = visualizer.currentTime || 0;
        if (typeof tCurrent === 'number' && Math.abs(vTime - tCurrent) > 0.05) {
            visualizer.seek?.(tCurrent);
        }
    }, [visualizer, tCurrent]);

    const stop = useCallback(() => {
        if (!visualizer) return;
        visualizer.stop();
        setIsPlaying(false);
    }, [visualizer, setIsPlaying]);

    const stepForward = useCallback(() => {
        visualizer?.stepForward?.();
    }, [visualizer]);

    const stepBackward = useCallback(() => {
        visualizer?.stepBackward?.();
    }, [visualizer]);

    const forceRender = useCallback(() => {
        visualizer?.invalidateRender?.();
    }, [visualizer]);

    const seekPercent = useCallback(
        (percent: number) => {
            if (!visualizer) return;
            const st = useTimelineStore.getState();
            const { startTick, endTick } = st.timelineView;
            const tm = getSharedTimingManager();
            tm.setBPM(st.timeline.globalBpm || 120);
            const startSec = tm.beatsToSeconds(startTick / tm.ticksPerQuarter);
            const endSec = tm.beatsToSeconds(endTick / tm.ticksPerQuarter);
            const range = Math.max(0.001, endSec - startSec);
            const target = startSec + Math.max(0, Math.min(1, percent)) * range;
            visualizer.seek?.(target);
        },
        [visualizer]
    );

    return { playPause, stop, stepForward, stepBackward, forceRender, seekPercent };
}
