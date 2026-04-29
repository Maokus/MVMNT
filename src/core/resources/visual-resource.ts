/**
 * VisualResource — the decoded, frame-ready representation of any visual source.
 *
 * Every resource is frame-based, including still images (one frame, durationMs=0).
 * There is no imageElement, isAnimated, or pivot field — the renderer operates
 * uniformly on the frames array regardless of source type.
 *
 * Named animations (from Sparrow XML or other structured sources) each own their
 * own frame list and playback settings. The full frames array on the resource is
 * the concatenation of all animation frames (or just the single frame for stills).
 */

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A single prepared animation frame ready to draw. */
export interface VisualFrame {
    /** Pre-created CanvasImageSource (ImageBitmap preferred, fallback canvas). */
    drawable: CanvasImageSource | null;
    /**
     * Frame display duration in milliseconds. Zero for static-image frames
     * (the frame is held indefinitely — getFrameAtTime returns it directly).
     */
    durationMs: number;
    /**
     * Source crop rectangle within the drawable texture.
     * Set for atlas frames; absent for GIF/static frames (each is a full bitmap).
     */
    sourceRect?: { sx: number; sy: number; sw: number; sh: number };
    /**
     * Trim offset: how far the visible content is inset from the logical frame origin.
     * Set for Sparrow atlas frames with transparent padding trimmed away.
     */
    trimOffset?: { x: number; y: number };
    /**
     * Full logical frame size including any trimmed transparent padding.
     * Set for Sparrow atlas frames; drives fit-mode calculations.
     */
    logicalSize?: { w: number; h: number };
    /** True when the frame is stored 90° clockwise in the atlas. Renderer rotates it back. */
    rotated?: boolean;
}

/**
 * A named animation within a decoded resource.
 *
 * Animations own their frame list directly — no startMs/endMs offsets into a
 * shared timeline. The renderer selects which animation to play at call time and
 * passes its frames + totalDurationMs to getFrameAtTime().
 *
 * ## fps vs. frame durationMs
 *
 * `fps` is the authoritative playback speed used when building or overriding an
 * animation. Each frame's `durationMs` is derived from it (1000 / fps) and is
 * what the renderer actually uses at draw time. `totalDurationMs` is the pre-summed
 * total kept for performance — it equals `frames.length × durationMs` when all
 * frames are uniform (which Sparrow and grid-atlas animations always are).
 *
 * All three values are kept in sync by the cache: an fps override rewrites every
 * frame's durationMs and recomputes totalDurationMs atomically, so callers can
 * rely on `fps × durationMs === 1000` and `totalDurationMs === sum(frame.durationMs)`
 * being true at all times.
 */
export interface VisualAnimation {
    name: string;
    /** Direct frame references for this animation (subset of the resource's full frames). */
    frames: VisualFrame[];
    /**
     * Authoritative playback speed in frames per second.
     * Each frame's durationMs equals 1000 / fps. Kept in sync with frame data
     * by the cache whenever this animation is built or overridden.
     */
    fps: number;
    /**
     * Pre-summed total duration in ms. Equals sum of all frame.durationMs values.
     * Zero if frames is empty.
     */
    totalDurationMs: number;
    loopMode: 'loop' | 'once' | 'pingpong';
}

export interface VisualResource {
    readonly key: string;
    status: ResourceStatus;
    /** Human-readable error string; set when status === 'error'. */
    errorMessage?: string;

    /** Intrinsic pixel dimensions of the source texture. */
    width: number;
    height: number;

    /**
     * Logical draw bounds for layout and fit-mode calculations.
     * Equal to width/height for plain images. For atlases, reflects a single
     * frame's logical size rather than the full texture.
     */
    logicalWidth: number;
    logicalHeight: number;

    /**
     * All frames for this resource, in sequence. Always populated on 'ready':
     *   - Still image: one frame with durationMs=0.
     *   - Animated GIF: N frames with per-frame delay.
     *   - Uniform atlas: N grid-cropped frames, each referencing the atlas bitmap.
     *   - Sparrow atlas: all frames across all animations, in XML order.
     */
    frames: VisualFrame[];

    /**
     * Total duration in ms across all frames. Zero for still images.
     * For Sparrow atlases this is the sum across all animations.
     */
    totalDurationMs: number;

    /**
     * Named animations. Keys are animation names (e.g. 'idle', 'run').
     * Empty for plain images and GIFs (use frames directly for those).
     */
    animations: Record<string, VisualAnimation>;
}

/** Result of getFrameAtTime: the drawable and per-frame metadata for rendering. */
export interface FrameAtTime {
    drawable: CanvasImageSource | null;
    /** Present when the drawable is an atlas texture; use 9-argument drawImage. */
    sourceRect?: { sx: number; sy: number; sw: number; sh: number };
    /** Forwarded from VisualFrame.trimOffset. */
    trimOffset?: { x: number; y: number };
    /** Forwarded from VisualFrame.logicalSize. */
    logicalSize?: { w: number; h: number };
    /** Forwarded from VisualFrame.rotated. */
    rotated?: boolean;
}

/**
 * Return the prepared drawable for a given local playback time.
 *
 * Pass either the resource's full frames array or a specific animation's frame list.
 * For still images (one frame or totalDurationMs === 0): returns frames[0] directly.
 *
 * `loopMode` controls what happens when `localTimeSec` exceeds the animation duration:
 *   - `'loop'`     — wraps back to the start (default).
 *   - `'once'`     — holds the last frame after the animation ends.
 *   - `'pingpong'` — plays forward then backward, alternating.
 *
 * No lazy work is done — all drawables are pre-baked by the cache.
 */
export function getFrameAtTime(
    frames: VisualFrame[],
    totalDurationMs: number,
    localTimeSec: number,
    loopMode: 'loop' | 'once' | 'pingpong' = 'loop'
): FrameAtTime {
    if (!frames.length) return { drawable: null };

    // Static image or single-frame: return the only frame unconditionally.
    if (frames.length === 1 || totalDurationMs <= 0) {
        const f = frames[0];
        return {
            drawable: f.drawable,
            sourceRect: f.sourceRect,
            trimOffset: f.trimOffset,
            logicalSize: f.logicalSize,
            rotated: f.rotated,
        };
    }

    const rawMs = localTimeSec * 1000;
    let tMs: number;

    if (loopMode === 'once') {
        // Hold the last frame once the animation ends.
        if (rawMs >= totalDurationMs) {
            const f = frames[frames.length - 1];
            return {
                drawable: f.drawable,
                sourceRect: f.sourceRect,
                trimOffset: f.trimOffset,
                logicalSize: f.logicalSize,
                rotated: f.rotated,
            };
        }
        tMs = rawMs;
    } else if (loopMode === 'pingpong') {
        // Fold time into a [0, 2×duration) cycle, then mirror the back half.
        const cycle = 2 * totalDurationMs;
        const t = ((rawMs % cycle) + cycle) % cycle;
        tMs = t < totalDurationMs ? t : cycle - t;
    } else {
        // loop (default)
        tMs = ((rawMs % totalDurationMs) + totalDurationMs) % totalDurationMs;
    }

    let acc = 0;
    let idx = frames.length - 1;
    for (let i = 0; i < frames.length; i++) {
        acc += frames[i].durationMs;
        if (tMs < acc) {
            idx = i;
            break;
        }
    }

    const frame = frames[idx];
    return {
        drawable: frame.drawable,
        sourceRect: frame.sourceRect,
        trimOffset: frame.trimOffset,
        logicalSize: frame.logicalSize,
        rotated: frame.rotated,
    };
}
