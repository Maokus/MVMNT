// Interaction-related math helpers extracted from PreviewPanel to centralize logic
// and keep UI component lean. Behaviour preserved verbatim.

import { buildGeometry, localPointFor, pointInPolygon } from './geometry';

// Generic shape-aware handle hit test identical to inline logic.
export function hitTestHandle(handle: any, x: number, y: number): boolean {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!handle) return false;
    if (handle.shape === 'circle') {
        const dx = x - handle.cx;
        const dy = y - handle.cy;
        return Math.sqrt(dx * dx + dy * dy) <= handle.r + 2; // +2 tolerance exactly as before
    }
    return (
        x >= handle.cx - handle.size * 0.5 &&
        x <= handle.cx + handle.size * 0.5 &&
        y >= handle.cy - handle.size * 0.5 &&
        y <= handle.cy + handle.size * 0.5
    );
}

// Prioritize anchor handle if overlapping; mirrors previous selection logic.
export function findHandleUnderPoint(handles: any[], x: number, y: number) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const anchorHandle = handles.find((h) => h.type === 'anchor');
    if (anchorHandle && hitTestHandle(anchorHandle, x, y)) return anchorHandle;
    return handles.find((h) => hitTestHandle(h, x, y)) || null;
}

// Compute world mouse point in canvas coordinate space accounting for CSS scaling.
export function getCanvasWorldPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const logicalWidth = Number(canvas.dataset.logicalWidth);
    const logicalHeight = Number(canvas.dataset.logicalHeight);
    const widthForScale = Number.isFinite(logicalWidth) && logicalWidth > 0 ? logicalWidth : canvas.width;
    const heightForScale = Number.isFinite(logicalHeight) && logicalHeight > 0 ? logicalHeight : canvas.height;
    const scaleX = rect.width > 0 ? widthForScale / rect.width : 1;
    const scaleY = rect.height > 0 ? heightForScale / rect.height : 1;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x, y };
}

// Determine fixed & drag points for a scale handle based on its type. Replicates switch block.
export function computeScaleHandleReferencePoints(handleType: string, rec: any) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const geom = buildGeometry(rec) || {};
    const bb = rec?.baseBounds || null;
    const localFor = (tag: string) => localPointFor(tag, bb);
    let fixedWorldPoint: { x: number; y: number } | null = null;
    let fixedLocalPoint: { x: number; y: number } | null = null;
    let dragLocalPoint: { x: number; y: number } | null = null;
    if ((geom as any).corners) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        const c = (geom as any).corners;
        const m = (geom as any).mids;
        switch (handleType) {
            case 'scale-nw':
                fixedWorldPoint = c.BR;
                fixedLocalPoint = localFor('BR');
                dragLocalPoint = localFor('TL');
                break;
            case 'scale-ne':
                fixedWorldPoint = c.BL;
                fixedLocalPoint = localFor('BL');
                dragLocalPoint = localFor('TR');
                break;
            case 'scale-se':
                fixedWorldPoint = c.TL;
                fixedLocalPoint = localFor('TL');
                dragLocalPoint = localFor('BR');
                break;
            case 'scale-sw':
                fixedWorldPoint = c.TR;
                fixedLocalPoint = localFor('TR');
                dragLocalPoint = localFor('BL');
                break;
            case 'scale-n':
                fixedWorldPoint = m.MBottom;
                fixedLocalPoint = localFor('MBottom');
                dragLocalPoint = localFor('MTop');
                break;
            case 'scale-s':
                fixedWorldPoint = m.MTop;
                fixedLocalPoint = localFor('MTop');
                dragLocalPoint = localFor('MBottom');
                break;
            case 'scale-e':
                fixedWorldPoint = m.MLeft;
                fixedLocalPoint = localFor('MLeft');
                dragLocalPoint = localFor('MRight');
                break;
            case 'scale-w':
                fixedWorldPoint = m.MRight;
                fixedLocalPoint = localFor('MRight');
                dragLocalPoint = localFor('MLeft');
                break;
            default:
                break;
        }
    }
    return { geom, fixedWorldPoint, fixedLocalPoint, dragLocalPoint };
}

// Constrain move delta to the dominant local axis when shift is held.
export function computeConstrainedMoveDelta(dx: number, dy: number, rotation: number, shiftKey: boolean) {
    if (!shiftKey) return { dx, dy };
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const axisX = { x: cos, y: sin };
    const axisY = { x: -sin, y: cos };
    const projX = dx * axisX.x + dy * axisX.y;
    const projY = dx * axisY.x + dy * axisY.y;
    if (Math.abs(projX) > Math.abs(projY)) {
        return { dx: axisX.x * projX, dy: axisX.y * projX };
    } else {
        return { dx: axisY.x * projY, dy: axisY.y * projY };
    }
}

// Element (bounds) hit test scanning back-to-front. Accepts polygon (corners) or AABB fallback.
export function elementHitTest(boundsList: any[], x: number, y: number) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    let hit: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = boundsList.length - 1; i >= 0; i--) {
        const b = boundsList[i];
        if (b.corners && b.corners.length === 4) {
            if (pointInPolygon(x, y, b.corners)) {
                hit = b;
                break;
            }
        } else if (
            x >= b.bounds.x &&
            x <= b.bounds.x + b.bounds.width &&
            y >= b.bounds.y &&
            y <= b.bounds.y + b.bounds.height
        ) {
            hit = b;
            break;
        }
    }
    return hit;
}

// Hover variant returning id only (for minimal updates) – keeps behaviour identical but reusable.
export function elementHoverId(boundsList: any[], x: number, y: number) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const hit = elementHitTest(boundsList, x, y);
    return hit ? hit.id : null;
}
