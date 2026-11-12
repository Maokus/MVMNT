import { useTimelineStore } from '@state/timelineStore';
import { findReferencedAudioSourceIds } from '@state/timeline/audioClips';

export function AudioPreparationStatus() {
    const message = useTimelineStore((state) => {
        const sources = [...findReferencedAudioSourceIds(state)];
        if (
            sources.some(
                (id) =>
                    state.audioCache[id]?.decodedState === 'deferred' ||
                    state.audioCache[id]?.decodedState === 'decoding'
            )
        )
            return 'Preparing audio…';
        if (sources.some((id) => state.audioFeatureCacheStatus[id]?.state === 'pending'))
            return 'Preparing audio analysis…';
        return '';
    });
    if (!message) return null;
    return (
        <div
            role="status"
            className="pointer-events-none absolute top-2 left-2 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white select-none"
        >
            {message}
        </div>
    );
}
