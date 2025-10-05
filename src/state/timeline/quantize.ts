import { CANONICAL_PPQ } from '@core/timing/ppq';

export type QuantizeSetting = 'off' | 'bar' | 'quarter' | 'eighth' | 'sixteenth';

export type SnapQuantizeOption = Exclude<QuantizeSetting, 'off'>;

export const TIMELINE_SNAP_OPTIONS: ReadonlyArray<{
    value: SnapQuantizeOption;
    label: string;
    shortLabel: string;
}> = [
    { value: 'bar', label: 'Bar', shortLabel: 'Bar' },
    { value: 'quarter', label: '1/4 note', shortLabel: '1/4' },
    { value: 'eighth', label: '1/8 note', shortLabel: '1/8' },
    { value: 'sixteenth', label: '1/16 note', shortLabel: '1/16' },
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
