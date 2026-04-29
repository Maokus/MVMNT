/**
 * VisualMediaPlayback — playback configuration for a visual media element.
 *
 * Owned by the scene element; the element computes localTime each frame and
 * passes it to VisualMedia.setLocalTime(). This keeps timing/playback concerns
 * separate from both resource data (VisualResource) and rendering (VisualMedia).
 *
 * `computeLocalTime` is a pure function of its inputs — it does not mutate any
 * state. Animation name selection is the caller's responsibility: pass the desired
 * name directly to VisualMedia.setAnimation() from element props or hardcoded values.
 */

export class VisualMediaPlayback {
    /** Playback rate multiplier (1 = normal speed). */
    speed: number = 1;

    /**
     * Scene-time at which this element begins playing (seconds).
     * Local time is clamped to 0 for scene times before this value.
     */
    startOffset: number = 0;

    /**
     * Compute local playback time (seconds) for a given scene time.
     * Pass the result to VisualMedia.setLocalTime() each frame.
     *
     * Returns the raw elapsed time after applying startOffset and speed.
     * VisualMedia's getFrameAtTime() handles all loop/once/pingpong behaviour
     * based on the active animation's loopMode.
     */
    computeLocalTime(sceneTimeSec: number): number {
        return Math.max(0, sceneTimeSec - this.startOffset) * this.speed;
    }
}
