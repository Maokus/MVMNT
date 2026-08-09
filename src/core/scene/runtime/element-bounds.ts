import type { RenderObject } from '@core/render/render-objects';

export interface ElementBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ElementBoundsMode = 'visual' | 'layout';

function isValidBounds(bounds: unknown, object?: RenderObject): bounds is ElementBounds {
    if (!bounds || typeof bounds !== 'object') return false;
    const value = bounds as Partial<ElementBounds>;
    if (![value.x, value.y, value.width, value.height].every((part) => typeof part === 'number' && isFinite(part))) {
        return false;
    }
    if (value.width! < 0 || value.height! < 0) {
        console.warn('Negative dimensions detected in bounds:', bounds, object?.constructor?.name);
        return false;
    }
    return true;
}

export function calculateElementBounds(
    renderObjects: readonly RenderObject[],
    mode: ElementBoundsMode,
    elementId: string | null
): ElementBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;

    for (const object of renderObjects) {
        const bounds = mode === 'visual' ? object.getVisualBounds?.() : object.getLayoutBounds?.();
        if (!isValidBounds(bounds, object)) continue;
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
        count += 1;
    }

    if (count === 0) {
        if (renderObjects.length > 0) console.warn(`No valid bounds found for scene element ${elementId}`);
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
