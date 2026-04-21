/**
 * Shared visual-media asset system.
 *
 * A VisualAsset is the decoded, cached representation of any image-like resource:
 *   - still image  → one frame, imageElement set, isAnimated = false
 *   - animated GIF → N frames with per-frame delay, isAnimated = true
 *   - (future)     → spritesheet / video can follow the same interface
 *
 * Frame bitmaps are lazily created and stored on the frame object so they are
 * shared across every scene element that references the same asset key.
 */

export type VisualAssetStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface VisualFrame {
    imageData: ImageData;
    bitmap: ImageBitmap | null;
    durationMs: number;
}

export interface VisualAsset {
    readonly key: string;
    status: VisualAssetStatus;
    // Intrinsic pixel dimensions of the source
    width: number;
    height: number;
    // Static image path
    imageElement: HTMLImageElement | null;
    // Animated path
    isAnimated: boolean;
    frames: VisualFrame[];
    totalDurationMs: number; // 0 for static (unused)
}

/**
 * Return the best available drawable for a given local playback time.
 *
 * For static assets: always returns imageElement.
 * For animated assets: wraps localTimeSec into [0, totalDuration) and picks the
 * correct frame, promoting ImageData → ImageBitmap lazily (shared per frame).
 */
export function getFrameAtTime(
    asset: VisualAsset,
    localTimeSec: number
): CanvasImageSource | ImageData | null {
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

    const frame = frames[idx];
    if (!frame.bitmap && 'createImageBitmap' in window) {
        createImageBitmap(frame.imageData)
            .then((bmp) => { frame.bitmap = bmp; })
            .catch(() => {});
    }
    return frame.bitmap ?? frame.imageData;
}
