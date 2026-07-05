import { CANONICAL_PPQ } from '@core/timing/ppq';

export type QuantizeSetting =
    | 'off'
    | 'bar'
    | 'quarter'
    | 'quarter-triplet'
    | 'eighth'
    | 'eighth-triplet'
    | 'sixteenth'
    | 'sixteenth-triplet'
    | 'thirty-second'
    | 'sixty-fourth'
    | 'arbitrary';

export type SnapQuantizeOption = Exclude<QuantizeSetting, 'off'>;

export const TIMELINE_SNAP_OPTIONS: ReadonlyArray<{
    value: SnapQuantizeOption;
    label: string;
    shortLabel: string;
}> = [
    { value: 'bar', label: '1/1 (bar)', shortLabel: '1/1' },
    { value: 'quarter', label: '1/4 note', shortLabel: '1/4' },
    { value: 'quarter-triplet', label: '1/6 note (quarter triplet)', shortLabel: '1/6' },
    { value: 'eighth', label: '1/8 note', shortLabel: '1/8' },
    { value: 'eighth-triplet', label: '1/12 note (eighth triplet)', shortLabel: '1/12' },
    { value: 'sixteenth', label: '1/16 note', shortLabel: '1/16' },
    { value: 'sixteenth-triplet', label: '1/24 note (sixteenth triplet)', shortLabel: '1/24' },
    { value: 'thirty-second', label: '1/32 note', shortLabel: '1/32' },
    { value: 'sixty-fourth', label: '1/64 note', shortLabel: '1/64' },
    { value: 'arbitrary', label: '1/N (custom)', shortLabel: '1/N' },
] as const;

export function formatQuantizeLabel(setting: QuantizeSetting, arbitraryN?: number): string {
    if (setting === 'off') return 'Off';
    if (setting === 'arbitrary') return arbitraryN ? `1/${arbitraryN} note (custom)` : '1/N (custom)';
    const opt = TIMELINE_SNAP_OPTIONS.find((o) => o.value === setting);
    return opt ? opt.label : 'Off';
}

export function formatQuantizeShortLabel(setting: QuantizeSetting, arbitraryN?: number): string {
    if (setting === 'off') return 'Off';
    if (setting === 'arbitrary') return arbitraryN ? `1/${arbitraryN}` : '1/N';
    const opt = TIMELINE_SNAP_OPTIONS.find((o) => o.value === setting);
    return opt ? opt.shortLabel : 'Off';
}

export function quantizeSettingToBeats(
    setting: QuantizeSetting,
    beatsPerBar: number,
    arbitraryN?: number,
): number | null {
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
        case 'sixty-fourth':
            return 0.0625;
        case 'quarter-triplet':
            return 2 / 3;
        case 'eighth-triplet':
            return 1 / 3;
        case 'sixteenth-triplet':
            return 1 / 6;
        case 'arbitrary': {
            const n = arbitraryN;
            return n && n > 0 && Number.isFinite(n) ? safeBeatsPerBar / n : null;
        }
        default:
            return null;
    }
}

export function quantizeSettingToTicks(
    setting: QuantizeSetting,
    beatsPerBar: number,
    ticksPerQuarter: number = CANONICAL_PPQ,
    arbitraryN?: number,
): number | null {
    const beatLength = quantizeSettingToBeats(setting, beatsPerBar, arbitraryN);
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
    const MIN_PX = 18;
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
