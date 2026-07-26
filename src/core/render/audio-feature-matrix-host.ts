import {
    getAudioFeatureMatrixRevision,
    readAudioFeatureMatrix,
    type AudioFeatureMatrix,
    type AudioFeatureMatrixRequest,
} from '@audio/features/audioFeatureMatrix';
import { useTimelineStore } from '@state/timelineStore';

/**
 * Engine boundary for first-party render resources. Scene elements receive
 * snapshots/revisions, never the Zustand store or feature-track objects.
 */
export function getHostAudioFeatureMatrixRevision(
    trackId: string,
    featureKey: string,
    analysisProfileId?: string | null
): string | null {
    return getAudioFeatureMatrixRevision(
        useTimelineStore.getState(),
        trackId,
        featureKey,
        analysisProfileId
    );
}

export function readHostAudioFeatureMatrix(
    request: AudioFeatureMatrixRequest
): AudioFeatureMatrix | null {
    return readAudioFeatureMatrix(useTimelineStore.getState(), request);
}
