function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export interface DescriptorSmoothingMigrationResult {
    descriptor: Record<string, unknown> | null;
    smoothing: number | null;
}

export function stripDescriptorSmoothing(entry: unknown): DescriptorSmoothingMigrationResult {
    if (!entry || typeof entry !== 'object') {
        return { descriptor: null, smoothing: null };
    }
    const source = entry as Record<string, unknown>;
    const smoothing = isFiniteNumber(source.smoothing) ? Math.max(0, source.smoothing) : null;
    if (!('smoothing' in source)) {
        return { descriptor: { ...source }, smoothing: null };
    }
    const { smoothing: _unused, ...rest } = source;
    return { descriptor: { ...rest }, smoothing };
}

export function stripDescriptorArraySmoothing(entries: unknown): {
    descriptors: Record<string, unknown>[];
    smoothingValues: number[];
} {
    if (!Array.isArray(entries)) {
        return { descriptors: [], smoothingValues: [] };
    }
    const descriptors: Record<string, unknown>[] = [];
    const smoothingValues: number[] = [];
    for (const entry of entries) {
        const { descriptor, smoothing } = stripDescriptorSmoothing(entry);
        if (descriptor) {
            descriptors.push(descriptor);
        }
        if (smoothing != null) {
            smoothingValues.push(smoothing);
        }
    }
    return { descriptors, smoothingValues };
}

export function logSmoothingMigration(
    elementId: string | null | undefined,
    elementType: string | null | undefined,
    smoothing: number,
): void {
    if (process.env.NODE_ENV !== 'development') {
        return;
    }
    const label = elementId ? `${elementType ?? 'element'}#${elementId}` : elementType ?? 'element';
    console.info(`[%caudio-migration%c] migrated descriptor smoothing to element property`, 'color:#22d3ee', 'color:inherit', {
        element: label,
        smoothing,
    });
}

