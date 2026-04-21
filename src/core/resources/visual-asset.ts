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
     * Draw-origin pivot as a fraction of logicalWidth/logicalHeight.
     * (0, 0) = top-left (default). (0.5, 0.5) = center.
     * Applied by VisualMedia so the element's local origin maps to this point,
     * enabling per-asset alignment for sprites (e.g. anchor at character feet).
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

/**
 * Return the pre-prepared drawable for a given local playback time.
 *
 * For static assets: returns imageElement.
 * For animated assets: wraps localTimeSec into [0, totalDuration) and returns
 * the drawable for the correct frame. No lazy work is done here — all drawables
 * are created by the VisualAssetStore before status reaches 'ready'.
 */
export function getFrameAtTime(
    asset: VisualAsset,
    localTimeSec: number
): CanvasImageSource | null {
    if (!asset.isAnimated) {
        return asset.imageElement;
    }

    const { frames, totalDurationMs } = asset;
    if (!frames.length) return null;

    const tMs = ((localTimeSec * 1000) % totalDurationMs + totalDurationMs) % totalDurationMs;
    let acc = 0;
    let idx = frames.length - 1; // fallback to last frame
    for (let i = 0; i < frames.length; i++) {
        acc += frames[i].durationMs;
        if (tMs < acc) {
            idx = i;
            break;
        }
    }

    return frames[idx].drawable;
}
