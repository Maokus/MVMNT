import type { DockSide } from '@state/workspacePanelsStore';

/** A compass zone: one of the four dock edges, or the middle merge area. */
export type DockZone = DockSide | 'center';

export interface GuideRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Edge band as a fraction of the centre column; the middle is the merge zone. */
export const DOCK_GUIDE_BAND = 0.25;

/**
 * Compass hit-test for the centre column: which dock zone the pointer at (x, y) is
 * over. The closest edge within `band` wins; anywhere else merges the tab instead of
 * starting a new dock. Distances are normalised, so wide and tall columns feel alike.
 */
export const resolveDockZone = (rect: GuideRect, x: number, y: number, band = DOCK_GUIDE_BAND): DockZone => {
    if (rect.width <= 0 || rect.height <= 0) return 'center';
    const nx = (x - rect.left) / rect.width;
    const ny = (y - rect.top) / rect.height;
    const edges: Array<[DockZone, number]> = [
        ['left', nx],
        ['right', 1 - nx],
        ['top', ny],
        ['bottom', 1 - ny],
    ];
    let zone: DockZone = 'center';
    let closest = band;
    for (const [candidate, distance] of edges) {
        if (distance < closest) {
            closest = distance;
            zone = candidate;
        }
    }
    return zone;
};
