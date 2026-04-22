/**
 * VisualMediaPlayback — instance-level playback state for a visual media element.
 *
 * Owned by the scene element; the element computes localTime each frame and
 * passes it to VisualMedia.setLocalTime(). This keeps timing/playback concerns
 * separate from both asset data (VisualAsset) and rendering (VisualMedia).
 *
 * Designed to grow toward named clip / state-machine animation:
 *   - clipName selects a named VisualClip from the asset (null = full animation)
 *   - loop mode, ping-pong, one-shot, etc. can be added here without touching
 *     the asset layer or the render object.
 */
import type { VisualClip } from './visual-asset';

export class VisualMediaPlayback {
    /** Playback rate multiplier (1 = normal speed). */
    speed: number = 1;

    /**
     * Scene-time at which this element begins playing (seconds).
     * Local time is clamped to 0 for scene times before this value.
     */
    startOffset: number = 0;

    /**
     * Active named clip; null = play the full animation.
     * When set, computeLocalTime() will confine playback to the clip's
     * [startMs, endMs) window and loop within that range.
     */
    clipName: string | null = null;

    /**
     * Compute local asset time (seconds) for a given scene time.
     * Pass the result to VisualMedia.setLocalTime() each frame.
     *
     * When clipName is set and the named clip is found in `clips`, the returned
     * time is absolute within the full animation timeline but confined to the
     * clip's [startMs, endMs) window (looping). This allows getFrameAtTime() to
     * select the correct frame without any special clip-awareness.
     *
     * @param sceneTimeSec  Current scene playback time in seconds.
     * @param clips         Optional clips map from the loaded VisualAsset.
     */
    computeLocalTime(sceneTimeSec: number, clips?: Record<string, VisualClip>): number {
        const rawTime = Math.max(0, sceneTimeSec - this.startOffset) * this.speed;

        if (this.clipName && clips) {
            const clip = clips[this.clipName];
            if (clip && clip.endMs > clip.startMs) {
                const clipDurationSec = (clip.endMs - clip.startMs) / 1000;
                const clipLocalTime = rawTime % clipDurationSec;
                return clip.startMs / 1000 + clipLocalTime;
            }
        }

        return rawTime;
    }
}
