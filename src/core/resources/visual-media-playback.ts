/**
 * VisualMediaPlayback — instance-level playback state for a visual media element.
 *
 * Owned by the scene element; the element computes localTime each frame and
 * passes it to VisualMedia.setLocalTime(). This keeps timing/playback concerns
 * separate from both resource data (VisualResource) and rendering (VisualMedia).
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
     * When set, VisualMedia uses that animation's own frame list and loopMode,
     * which means `computeLocalTime` only needs to return raw elapsed time —
     * no caller-side wrapping is required.
     */
    animationName: string | null = null;

    /**
     * Compute local playback time (seconds) for a given scene time.
     * Pass the result to VisualMedia.setLocalTime() each frame.
     *
     * Returns the raw elapsed time after applying startOffset and speed.
     * VisualMedia's getFrameAtTime() handles all loop/once/pingpong behaviour
     * based on the active animation's loopMode — no pre-wrapping is done here.
     *
     * @param sceneTimeSec  Current scene playback time in seconds.
     * @param animations    Accepted for backwards compatibility; no longer used.
     */
    computeLocalTime(sceneTimeSec: number, animations?: Record<string, VisualAnimation>): number {
        void animations; // loopMode is now handled by getFrameAtTime / VisualMedia
        return Math.max(0, sceneTimeSec - this.startOffset) * this.speed;
    }
}
