import { CANONICAL_PPQ } from '@core/timing/ppq';

export type QuantizeSetting = 'off' | 'bar' | 'quarter' | 'eighth' | 'sixteenth' | 'thirty-second';

export type SnapQuantizeOption = Exclude<QuantizeSetting, 'off'>;

export const TIMELINE_SNAP_OPTIONS: ReadonlyArray<{
    value: SnapQuantizeOption;
    label: string;
    shortLabel: string;
}> = [
    { value: 'bar', label: '1/1 (bar)', shortLabel: '1/1' },
    { value: 'quarter', label: '1/4 note', shortLabel: '1/4' },
    { value: 'eighth', label: '1/8 note', shortLabel: '1/8' },
    { value: 'sixteenth', label: '1/16 note', shortLabel: '1/16' },
    { value: 'thirty-second', label: '1/32 note', shortLabel: '1/32' },
] as const;

export function formatQuantizeLabel(setting: QuantizeSetting): string {
    if (setting === 'off') return 'Off';
    const opt = TIMELINE_SNAP_OPTIONS.find((o) => o.value === setting);
    return opt ? opt.label : 'Off';
}

export function formatQuantizeShortLabel(setting: QuantizeSetting): string {
    if (setting === 'off') return 'Off';
    const opt = TIMELINE_SNAP_OPTIONS.find((o) => o.value === setting);
    return opt ? opt.shortLabel : 'Off';
}

export function quantizeSettingToBeats(setting: QuantizeSetting, beatsPerBar: number): number | null {
    const safeBeatsPerBar = Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : 4;
    switch (setting) {
        case 'off':
            return null;
        case 'bar':
            return safeBeatsPerBar;
        case 'quarter':
            return 1;
        case 'eighth':
            return 0.5;
        case 'sixteenth':
            return 0.25;
        case 'thirty-second':
            return 0.125;
        default:
            return null;
    }
}

export function quantizeSettingToTicks(setting: QuantizeSetting, beatsPerBar: number, ticksPerQuarter: number = CANONICAL_PPQ): number | null {
    const beatLength = quantizeSettingToBeats(setting, beatsPerBar);
    if (beatLength == null) return null;
    const resolution = beatLength * ticksPerQuarter;
    return resolution > 0 ? Math.round(resolution) : null;
}

/**
 * Returns the best snap setting for a given zoom level (view range in ticks).
 * Used by adaptive snapping mode to pick the snap denominator automatically.
 */
export function getAdaptiveSnapSetting(
    viewRangeTicks: number,
    beatsPerBar: number,
    ticksPerQuarter: number = CANONICAL_PPQ,
): SnapQuantizeOption {
    const safeBpb = Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : 4;
    const barsVisible = viewRangeTicks / (safeBpb * ticksPerQuarter);
    if (barsVisible > 32) return 'bar';
    if (barsVisible > 8) return 'quarter';
    if (barsVisible > 2) return 'eighth';
    if (barsVisible > 0.5) return 'sixteenth';
    return 'thirty-second';
}

/**
 * Returns which grid subdivisions should be visible at a given pixel density.
 * Used by adaptive GridLines to determine how many levels to draw.
 */
export function getAdaptiveGridSubdivisions(
    widthPx: number,
    viewRangeTicks: number,
    beatsPerBar: number,
    ticksPerQuarter: number = CANONICAL_PPQ,
): { showBeats: boolean; showEighths: boolean; showSixteenths: boolean } {
    const MIN_PX = 18; // minimum pixels between lines to render a subdivision level
    if (viewRangeTicks <= 0 || widthPx <= 0) return { showBeats: false, showEighths: false, showSixteenths: false };
    const pxPerTick = widthPx / viewRangeTicks;
    const pxPerBeat = pxPerTick * ticksPerQuarter;
    const pxPerEighth = pxPerBeat * 0.5;
    const pxPerSixteenth = pxPerBeat * 0.25;
    return {
        showBeats: pxPerBeat >= MIN_PX,
        showEighths: pxPerEighth >= MIN_PX,
        showSixteenths: pxPerSixteenth >= MIN_PX,
    };
}
