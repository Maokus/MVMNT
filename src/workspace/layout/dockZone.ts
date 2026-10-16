import type { DockSide } from '@state/workspacePanelsStore';

export type DockZone = DockSide | 'center';

export interface GuideRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const DOCK_GUIDE_BAND = 0.25;

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
