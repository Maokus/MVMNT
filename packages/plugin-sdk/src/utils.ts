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

export function parseFontSelection(value: string): { family: string; weight?: string } {
    const [family, weight] = String(value || 'Inter').split('|');
    return { family: family.trim(), ...(weight ? { weight: weight.trim() } : {}) };
}

export function ensureFontLoaded(family: string, weight: string | number = 400): void {
    if (typeof document === 'undefined' || !document.fonts || !family) return;
    void document.fonts.load(`${weight} 16px "${family.replace(/"/g, '')}"`);
}
