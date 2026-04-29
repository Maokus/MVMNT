/**
 * VisualMediaPlayback — instance-level playback state for a visual media element.
 *
 * Owned by the scene element; the element computes localTime each frame and
 * passes it to VisualMedia.setLocalTime(). This keeps timing/playback concerns
 * separate from both resource data (DecodedResource) and rendering (VisualMedia).
 */
import type { VisualAnimation } from './visual-resource';

export class VisualMediaPlayback {
    /** Playback rate multiplier (1 = normal speed). */
    speed: number = 1;

    /**
     * Scene-time at which this element begins playing (seconds).
     * Local time is clamped to 0 for scene times before this value.
     */
    startOffset: number = 0;

    /**
     * Active named animation; null = play the full resource frame sequence.
     * When set and the named animation is found in the resource, computeLocalTime()
     * confines playback to that animation's duration and loops within it.
     */
    animationName: string | null = null;

    /**
     * Compute local playback time (seconds) for a given scene time.
     * Pass the result to VisualMedia.setLocalTime() each frame.
     *
     * When animationName is set and found in `animations`, the returned time
     * loops within [0, animation.totalDurationMs / 1000). VisualMedia then uses
     * that animation's own frame list via setAnimation(), so no absolute offset
     * into a shared timeline is needed.
     *
     * @param sceneTimeSec  Current scene playback time in seconds.
     * @param animations    Optional animations map from the loaded DecodedResource.
     */
    computeLocalTime(sceneTimeSec: number, animations?: Record<string, VisualAnimation>): number {
        const rawTime = Math.max(0, sceneTimeSec - this.startOffset) * this.speed;

        if (this.animationName && animations) {
            const anim = animations[this.animationName];
            if (anim && anim.totalDurationMs > 0) {
                const animDurationSec = anim.totalDurationMs / 1000;
                return rawTime % animDurationSec;
            }
        }

        return rawTime;
    }
}
