// Lightweight dynamic Google Font loader with per-weight tracking
// Inspired by font-picker-react but simplified for this project
const loadedFamilies: Map<string, Set<number>> = new Map();

function familyToURLParam(family: string): string {
    return family.trim().replace(/\s+/g, '+');
}

export interface LoadFontOptions {
    weights?: number[];
    italics?: boolean;
    display?: 'auto' | 'swap' | 'block' | 'fallback' | 'optional';
}

export function loadGoogleFont(family: string, options: LoadFontOptions = {}): void {
    if (!family) return;
    const weights = options.weights?.length ? options.weights : [400, 700];
    const italics = options.italics ? true : false;
    const display = options.display || 'swap';
    const existing = loadedFamilies.get(family) || new Set<number>();
    // Determine which weights are new
    const newWeights = weights.filter((w) => !existing.has(w));
    if (newWeights.length === 0) return; // nothing new to load

    // Merge new weights into existing set
    newWeights.forEach((w) => existing.add(w));
    loadedFamilies.set(family, existing);

    // Build variant param for all loaded weights (ensures a single stylesheet covers all)
    const allWeights = Array.from(existing).sort((a, b) => a - b);
    let variantParam = '';
    if (italics) {
        const combos: string[] = [];
        allWeights.forEach((w) => {
            combos.push(`0,${w}`);
            combos.push(`1,${w}`);
        });
        variantParam = `ital,wght@${combos.join(';')}`;
    } else {
        variantParam = `wght@${allWeights.join(';')}`;
    }
    const href = `https://fonts.googleapis.com/css2?family=${familyToURLParam(
        family
    )}:${variantParam}&display=${display}`;
    if (typeof document !== 'undefined') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
}

export function ensureFontLoaded(family: string) {
    loadGoogleFont(family, { weights: [400, 500, 600, 700], italics: false, display: 'swap' });
}

export function isFontLoaded(family: string): boolean {
    return loadedFamilies.has(family);
}

// Parse a serialized font selection string of the form "Family" or "Family|700"
export function parseFontSelection(value?: string): { family: string; weight?: string } {
    if (!value) return { family: '' };
    const pipeIndex = value.indexOf('|');
    if (pipeIndex === -1) return { family: value };
    return { family: value.slice(0, pipeIndex), weight: value.slice(pipeIndex + 1) };
}
