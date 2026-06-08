export interface TrackRowSizing {
    controlSize: number;
    pillHeight: number;
    baseFontSize: number;
    smallFontSize: number;
}

export function computeTrackRowSizing(rowHeight: number): TrackRowSizing {
    return {
        controlSize: Math.max(14, Math.min(24, Math.round(rowHeight - 6))),
        pillHeight: Math.max(12, Math.min(20, Math.round(rowHeight - 8))),
        baseFontSize: Math.max(10, Math.min(13, rowHeight / 2.2)),
        smallFontSize: Math.max(9, Math.min(11, rowHeight / 2.6)),
    };
}
