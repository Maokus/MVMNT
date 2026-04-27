/**
 * Shared visual-media asset system.
 *
 * A VisualAsset is the decoded, cached representation of any image-like resource:
 *   - still image  → imageElement set, isAnimated = false, no frames
 *   - animated GIF → N frames with per-frame delay, isAnimated = true
 *   - (future)     → spritesheet / video can follow the same interface
 *
 * Frame drawables are pre-created by the VisualAssetStore (ImageBitmap preferred,
 * fallback to a pre-baked canvas) before status reaches 'ready'. VisualMedia can
 * therefore call ctx.drawImage() directly with no render-time conversion work.
 */

export type VisualAssetStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A single prepared animation frame ready to draw. */
export interface VisualFrame {
    /** Pre-created CanvasImageSource (ImageBitmap preferred, fallback canvas). */
    drawable: CanvasImageSource | null;
    durationMs: number;
    /**
     * Source crop rectangle within the drawable texture.
     * Set for atlas frames; absent for GIF frames (each is a full-size bitmap).
     */
    sourceRect?: { sx: number; sy: number; sw: number; sh: number };
    /**
     * Trim offset: how far the visible content is inset from the logical frame origin.
     * Set for Sparrow atlas frames with transparent padding trimmed away.
     * Derived from Sparrow's (-frameX, -frameY) fields.
     */
    trimOffset?: { x: number; y: number };
    /**
     * Full logical frame size including any trimmed transparent padding.
     * Set for Sparrow atlas frames; drives fit-mode calculations.
     * Derived from Sparrow's (frameWidth, frameHeight) fields.
     */
    logicalSize?: { w: number; h: number };
    /** True when the frame is stored 90° clockwise in the atlas. Renderer rotates it back. */
    rotated?: boolean;
}

/**
 * Layout descriptor for a sprite atlas: a single image divided into a uniform
 * grid of animation frames. Pass to VisualAssetStore.loadAtlas().
 */
export interface AtlasLayout {
    columns: number;
    rows: number;
    /** Total number of frames; defaults to columns × rows. */
    frameCount?: number;
    /** Duration of each frame in ms; defaults to 1000/12 (~83 ms, 12 fps). */
    frameDurationMs?: number;
}

/**
 * A named clip within an asset's animation timeline.
 * Foundation for sprite-based / state-machine animation: define regions like
 * 'idle', 'run', 'jump' and switch between them at runtime.
 * startMs/endMs are relative to the full animation timeline.
 */
export interface VisualClip {
    name: string;
    startMs: number;
    endMs: number;
}

export interface VisualAsset {
    readonly key: string;
    status: VisualAssetStatus;

    /** Intrinsic pixel dimensions of the source texture. */
    width: number;
    height: number;

    /**
     * Logical draw bounds, used for layout and pivot calculations.
     * Equal to width/height for simple images. For spritesheets or assets with
     * transparent padding the logical region may differ from the raw texture size.
     */
    logicalWidth: number;
    logicalHeight: number;

    /**
     * Immutable registration metadata: the natural registration point for this asset,
     * as a fraction of logicalWidth/logicalHeight.
     * (0, 0) = top-left (default). (0.5, 0.5) = center.
     *
     * This is asset-level metadata — set once by the store, never mutated at runtime.
     * It is preserved for future use as per-frame registration data (e.g., individual
     * sprite-sheet frame origins for character sprites anchored at the feet).
     *
     * For per-instance draw origin control use `VisualMedia.originX/originY` instead.
     * Setting this field on a shared cached asset to achieve per-instance effects
     * would corrupt shared state and break render determinism.
     */
    pivot: { x: number; y: number };

    /** Static image (null for animated assets). */
    imageElement: HTMLImageElement | null;

    /** True if this asset has multiple frames that advance over time. */
    isAnimated: boolean;
    frames: VisualFrame[];
    totalDurationMs: number;

    /**
     * Named clips within the animation timeline.
     * Keys are clip names (e.g. 'idle', 'run'). Empty for simple assets.
     */
    clips: Record<string, VisualClip>;
}

/** Result of getFrameAtTime: the drawable and per-frame metadata for rendering. */
export interface FrameAtTime {
    drawable: CanvasImageSource | null;
    /** Present when the drawable is an atlas texture; use 9-argument drawImage. */
    sourceRect?: { sx: number; sy: number; sw: number; sh: number };
    /** Forwarded from VisualFrame.trimOffset; see that field for semantics. */
    trimOffset?: { x: number; y: number };
    /** Forwarded from VisualFrame.logicalSize; see that field for semantics. */
    logicalSize?: { w: number; h: number };
    /** Forwarded from VisualFrame.rotated; see that field for semantics. */
    rotated?: boolean;
}

/**
 * Return the pre-prepared drawable (and optional source rect) for a given local
 * playback time.
 *
 * For static assets: returns { drawable: imageElement }.
 * For animated assets: wraps localTimeSec into [0, totalDuration) and returns
 * the drawable for the correct frame. No lazy work is done — all drawables are
 * created by the VisualAssetStore before status reaches 'ready'.
 */
export function getFrameAtTime(
    asset: VisualAsset,
    localTimeSec: number
): FrameAtTime {
    if (!asset.isAnimated) {
        return { drawable: asset.imageElement };
    }

    const { frames, totalDurationMs } = asset;
    if (!frames.length) return { drawable: null };

    const tMs = ((localTimeSec * 1000) % totalDurationMs + totalDurationMs) % totalDurationMs;
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
