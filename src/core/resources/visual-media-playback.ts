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
     * When set, computeLocalTime() will be relative to the clip's startMs
     * and capped at its duration — preparation for clip-based state machines.
     */
    clipName: string | null = null;

    /**
     * Compute local asset time (seconds) for a given scene time.
     * Pass the result to VisualMedia.setLocalTime() each frame.
     */
    computeLocalTime(sceneTimeSec: number): number {
        return Math.max(0, sceneTimeSec - this.startOffset) * this.speed;
    }
}
