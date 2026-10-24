import { clamp } from '@math/transforms/numeric';

export interface PopupPosition {
    x: number;
    y: number;
}

export const VIEWPORT_PADDING = 8;

export function clampPopupToViewport(
    pos: PopupPosition,
    popupWidth: number,
    viewportWidth: number,
    popupHeight?: number,
    viewportHeight?: number,
    margin: number = VIEWPORT_PADDING
): PopupPosition {
    const x = clamp(pos.x, margin, Math.max(margin, viewportWidth - popupWidth - margin));
    if (popupHeight === undefined || viewportHeight === undefined) {
        return { x, y: pos.y };
    }
    const y = clamp(pos.y, margin, Math.max(margin, viewportHeight - popupHeight - margin));
    return { x, y };
}
