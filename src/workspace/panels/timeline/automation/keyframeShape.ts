import type { HandleType, SegmentInterpolation } from '@automation/types';

export const KEYFRAME_DIAMOND_SIZE = 7;
export type KeyframeHalfShape = 'diamond' | 'square' | 'hourglass' | 'circle';

const DYNAMIC_EASING_MODES = new Set(['back', 'bounce', 'elastic']);

export function getKeyframeHalfShape(
    segment: SegmentInterpolation | undefined | null,
    _handleType: HandleType | undefined,
    side: 'left' | 'right'
): KeyframeHalfShape {
    if (!segment) return 'diamond';
    const { mode } = segment;
    if (mode === 'constant') return 'square';
    if (mode === 'linear') return 'diamond';
    if (mode === 'bezier') return 'circle';
    const direction =
        segment.direction === 'auto'
            ? DYNAMIC_EASING_MODES.has(mode)
                ? 'ease_out'
                : 'ease_in_out'
            : segment.direction;
    if (direction === 'ease_in_out') return 'hourglass';
    if (direction === 'ease_in') return side === 'right' ? 'hourglass' : 'diamond';
    return side === 'right' ? 'diamond' : 'hourglass';
}

export function buildKeyframeShapePath(
    leftShape: KeyframeHalfShape,
    rightShape: KeyframeHalfShape,
    x: number,
    centerY: number,
    size: number
): string {
    const left = x - size;
    const right = x + size;
    const top = centerY - size;
    const bottom = centerY + size;
    const leftSegment =
        leftShape === 'diamond'
            ? `L${left},${centerY} L${x},${bottom}`
            : leftShape === 'hourglass'
              ? `L${left},${top} L${x},${centerY} L${left},${bottom} L${x},${bottom}`
              : leftShape === 'square'
                ? `L${left},${top} L${left},${bottom} L${x},${bottom}`
                : `A${size},${size} 0 0,0 ${x},${bottom}`;
    const rightSegment =
        rightShape === 'diamond'
            ? `L${right},${centerY} L${x},${top}`
            : rightShape === 'hourglass'
              ? `L${right},${bottom} L${x},${centerY} L${right},${top} L${x},${top}`
              : rightShape === 'square'
                ? `L${right},${bottom} L${right},${top} L${x},${top}`
                : `A${size},${size} 0 0,0 ${x},${top}`;
    return `M${x},${top} ${leftSegment} ${rightSegment} Z`;
}
