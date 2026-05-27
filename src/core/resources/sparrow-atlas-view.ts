/**
 * getSparrowFrameInfo — inspect logical frame dimensions and trim offsets from a
 * decoded Sparrow atlas resource.
 *
 * Sparrow atlases trim transparent padding from each sprite before packing. The
 * decoded resource retains the full logical frame size (frameWidth × frameHeight
 * from the XML) alongside the trim insets. Use this helper to read those values
 * without hardcoding them as constants.
 *
 * @example
 * // Size the VisualMedia container to the logical frame so 'clip' mode shows the
 * // full sprite without overflow, regardless of how much was trimmed.
 * const info = getSparrowFrameInfo(resource, 'idle0');
 * if (info) {
 *   media.setDimensions(info.frameW, info.frameH).setFitMode('clip').setFramePlacement('center');
 * }
 */

import type { VisualResource } from './visual-resource';

/** Logical frame dimensions and trim insets for a single Sparrow animation frame. */
export interface SparrowFrameInfo {
    /** Full logical frame width, including any trimmed transparent padding. */
    frameW: number;
    /** Full logical frame height, including any trimmed transparent padding. */
    frameH: number;
    /**
     * X inset of the actual pixel content within the logical frame.
     * Equals `frameX` from the Sparrow XML (a positive number when there is
     * transparent padding on the left).
     */
    trimX: number;
    /**
     * Y inset of the actual pixel content within the logical frame.
     * Equals `frameY` from the Sparrow XML (a positive number when there is
     * transparent padding on the top).
     */
    trimY: number;
}

/**
 * Returns the logical frame dimensions and trim insets for the given animation
 * and frame index in a decoded Sparrow resource.
 *
 * Returns `null` when:
 * - the resource is not ready (status !== 'ready')
 * - the animation name does not exist in the resource
 * - the frame has no `logicalSize` (non-Sparrow resources such as grid atlases)
 *
 * @param resource - a decoded VisualResource (status must be 'ready')
 * @param animationName - name of the Sparrow animation to inspect
 * @param frameIndex - which frame in the animation to read (default: 0)
 */
export function getSparrowFrameInfo(
    resource: VisualResource,
    animationName: string,
    frameIndex = 0
): SparrowFrameInfo | null {
    if (resource.status !== 'ready') return null;
    const anim = resource.animations[animationName];
    if (!anim || anim.frames.length === 0) return null;
    const frame = anim.frames[Math.min(frameIndex, anim.frames.length - 1)];
    if (!frame.logicalSize) return null;
    return {
        frameW: frame.logicalSize.w,
        frameH: frame.logicalSize.h,
        trimX: frame.trimOffset?.x ?? 0,
        trimY: frame.trimOffset?.y ?? 0,
    };
}
