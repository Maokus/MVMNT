/**
 * Geometry snapping helpers used by canvas interactions.
 */

export type SnapOrientation = 'vertical' | 'horizontal';

export interface SnapBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type SnapTargetType = 'element-edge' | 'element-center' | 'canvas-edge' | 'canvas-center';

export interface SnapTarget {
    orientation: SnapOrientation;
    position: number;
    type: SnapTargetType;
    elementId?: string;
}

export interface SnapGuide {
    orientation: SnapOrientation;
    position: number;
    sourceType: SnapTargetType;
    sourceElementId?: string;
    elementEdge?: 'left' | 'right' | 'centerX' | 'top' | 'bottom' | 'centerY';
}

export const DEFAULT_SNAP_TOLERANCE = 6;

interface SnapCandidate {
    orientation: SnapOrientation;
    position: number;
    elementEdge?: SnapGuide['elementEdge'];
}

interface SnapEvaluation {
    target: SnapTarget;
    diff: number;
    candidate: SnapCandidate;
}

function evaluateBestSnap(
    candidates: SnapCandidate[],
    targets: SnapTarget[],
    tolerance: number
): SnapEvaluation | null {
    let best: SnapEvaluation | null = null;
    const maxTolerance = Math.max(0, tolerance);
    for (const candidate of candidates) {
        for (const target of targets) {
            if (target.orientation !== candidate.orientation) continue;
            const diff = target.position - candidate.position;
            const absDiff = Math.abs(diff);
            if (absDiff > maxTolerance) continue;
            if (!best || absDiff < Math.abs(best.diff)) {
                best = { target, diff, candidate };
            }
        }
    }
    return best;
}

export function snapTranslation(
    bounds: SnapBounds | null | undefined,
    dx: number,
    dy: number,
    targets: SnapTarget[],
    tolerance = DEFAULT_SNAP_TOLERANCE
): { dx: number; dy: number; guides: SnapGuide[] } {
    if (!bounds || !targets.length) {
        return { dx, dy, guides: [] };
    }
    const guides: SnapGuide[] = [];
    const verticalCandidates: SnapCandidate[] = [
        { orientation: 'vertical', position: bounds.x + dx, elementEdge: 'left' },
        { orientation: 'vertical', position: bounds.x + bounds.width * 0.5 + dx, elementEdge: 'centerX' },
        { orientation: 'vertical', position: bounds.x + bounds.width + dx, elementEdge: 'right' },
    ];
    const horizontalCandidates: SnapCandidate[] = [
        { orientation: 'horizontal', position: bounds.y + dy, elementEdge: 'top' },
        { orientation: 'horizontal', position: bounds.y + bounds.height * 0.5 + dy, elementEdge: 'centerY' },
        { orientation: 'horizontal', position: bounds.y + bounds.height + dy, elementEdge: 'bottom' },
    ];
    const verticalSnap = evaluateBestSnap(verticalCandidates, targets, tolerance);
    if (verticalSnap) {
        dx += verticalSnap.diff;
        guides.push({
            orientation: 'vertical',
            position: verticalSnap.target.position,
            sourceType: verticalSnap.target.type,
            sourceElementId: verticalSnap.target.elementId,
            elementEdge: verticalSnap.candidate.elementEdge,
        });
    }
    const horizontalSnap = evaluateBestSnap(horizontalCandidates, targets, tolerance);
    if (horizontalSnap) {
        dy += horizontalSnap.diff;
        guides.push({
            orientation: 'horizontal',
            position: horizontalSnap.target.position,
            sourceType: horizontalSnap.target.type,
            sourceElementId: horizontalSnap.target.elementId,
            elementEdge: horizontalSnap.candidate.elementEdge,
        });
    }
    return { dx, dy, guides };
}

export function snapPoint(
    x: number,
    y: number,
    targets: SnapTarget[],
    tolerance = DEFAULT_SNAP_TOLERANCE
): { x: number; y: number; guides: SnapGuide[] } {
    if (!targets.length) {
        return { x, y, guides: [] };
    }
    const guides: SnapGuide[] = [];
    const verticalSnap = evaluateBestSnap(
        [{ orientation: 'vertical', position: x }],
        targets,
        tolerance
    );
    if (verticalSnap) {
        x += verticalSnap.diff;
        guides.push({
            orientation: 'vertical',
            position: verticalSnap.target.position,
            sourceType: verticalSnap.target.type,
            sourceElementId: verticalSnap.target.elementId,
        });
    }
    const horizontalSnap = evaluateBestSnap(
        [{ orientation: 'horizontal', position: y }],
        targets,
        tolerance
    );
    if (horizontalSnap) {
        y += horizontalSnap.diff;
        guides.push({
            orientation: 'horizontal',
            position: horizontalSnap.target.position,
            sourceType: horizontalSnap.target.type,
            sourceElementId: horizontalSnap.target.elementId,
        });
    }
    return { x, y, guides };
}

export function buildSnapTargets(visualizer: any, excludeId: string | null = null): SnapTarget[] {
    const time = visualizer?.getCurrentTime?.() ?? 0;
    const boundsList: any[] = visualizer?.getElementBoundsAtTime?.(time) ?? [];
    const width = visualizer?.canvas?.width ?? null;
    const height = visualizer?.canvas?.height ?? null;
    const targets: SnapTarget[] = [];
    for (const rec of boundsList) {
        if (!rec || !rec.bounds) continue;
        if (excludeId && rec.id === excludeId) continue;
        const b = rec.bounds as SnapBounds;
        const left = b.x;
        const right = b.x + b.width;
        const cx = b.x + b.width * 0.5;
        const top = b.y;
        const bottom = b.y + b.height;
        const cy = b.y + b.height * 0.5;
        targets.push({ orientation: 'vertical', position: left, type: 'element-edge', elementId: rec.id });
        targets.push({ orientation: 'vertical', position: cx, type: 'element-center', elementId: rec.id });
        targets.push({ orientation: 'vertical', position: right, type: 'element-edge', elementId: rec.id });
        targets.push({ orientation: 'horizontal', position: top, type: 'element-edge', elementId: rec.id });
        targets.push({ orientation: 'horizontal', position: cy, type: 'element-center', elementId: rec.id });
        targets.push({ orientation: 'horizontal', position: bottom, type: 'element-edge', elementId: rec.id });
    }
    if (typeof width === 'number' && width > 0) {
        targets.push({ orientation: 'vertical', position: 0, type: 'canvas-edge' });
        targets.push({ orientation: 'vertical', position: width, type: 'canvas-edge' });
        targets.push({ orientation: 'vertical', position: width * 0.5, type: 'canvas-center' });
    }
    if (typeof height === 'number' && height > 0) {
        targets.push({ orientation: 'horizontal', position: 0, type: 'canvas-edge' });
        targets.push({ orientation: 'horizontal', position: height, type: 'canvas-edge' });
        targets.push({ orientation: 'horizontal', position: height * 0.5, type: 'canvas-center' });
    }
    return targets;
}
