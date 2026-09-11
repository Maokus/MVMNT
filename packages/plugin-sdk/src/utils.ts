import { PluginContractError } from './api.js';

export function midiNoteToName(note: number): string {
    if (!Number.isFinite(note)) return 'C-1';
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const value = Math.max(0, Math.min(127, Math.round(note)));
    return `${names[value % 12]}${Math.floor(value / 12) - 1}`;
}

export function ensureEightDigitHex(color: string): string {
    const normalized = color.startsWith('#') ? color : `#${color}`;
    return normalized.length === 7 ? `${normalized}FF` : normalized;
}

export type FontSelectionSource = 'built-in' | 'device' | 'project' | 'missing' | 'legacy';

/** Host-resolved description of a MVMNT font-selection token. */
export interface ParsedFontSelection {
    readonly family: string;
    readonly source: FontSelectionSource;
    readonly assetId?: string;
    readonly weight?: string;
    readonly italic?: boolean;
    readonly isCustom?: boolean;
    readonly missing?: boolean;
    readonly token: string;
}

const hostFontUtilityError = (name: string): PluginContractError =>
    new PluginContractError(`${name}() is host-provided and can only be called inside MVMNT`);

/** Resolve a MVMNT font token through the host's project-font registry. */
export function parseFontSelection(_selection?: string): ParsedFontSelection {
    throw hostFontUtilityError('parseFontSelection');
}

/** Resolve and load a MVMNT font token, including embedded project fonts. */
export async function ensureFontLoaded(_selection: string, _weight?: string | number): Promise<void> {
    throw hostFontUtilityError('ensureFontLoaded');
}
