export function normalizeTimelineView(startTick: number, endTick: number): { startTick: number; endTick: number } {
    const start = Math.min(startTick, endTick);
    const end = Math.max(startTick, endTick);
    return { startTick: start, endTick: end - start < 1 ? start + 1 : end };
}

export function normalizePlaybackRange(startTick?: number, endTick?: number) {
    return {
        startTick: typeof startTick === 'number' ? Math.max(0, startTick) : undefined,
        endTick: typeof endTick === 'number' ? Math.max(0, endTick) : undefined,
    };
}

export function normalizeTimelineRowHeight(height: number): number {
    return Math.max(16, Math.min(160, Math.floor(height)));
}
