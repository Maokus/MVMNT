// Lightweight dynamic Google Font loader
// Inspired by font-picker-react but simplified for this project
const loadedFamilies: Set<string> = new Set();

function familyToURLParam(family: string): string {
    return family.trim().replace(/\s+/g, '+');
}

export interface LoadFontOptions {
    weights?: number[];
    italics?: boolean;
    display?: 'auto' | 'swap' | 'block' | 'fallback' | 'optional';
}

export function loadGoogleFont(family: string, options: LoadFontOptions = {}): void {
    if (!family || loadedFamilies.has(family)) return;
    const weights = options.weights?.length ? options.weights : [400, 700];
    const italics = options.italics ? true : false;
    const display = options.display || 'swap';

    let variantParam = '';
    if (italics) {
        const combos: string[] = [];
        weights.forEach((w) => {
            combos.push(`0,${w}`);
            combos.push(`1,${w}`);
        });
        variantParam = `ital,wght@${combos.join(';')}`;
    } else {
        variantParam = `wght@${weights.join(';')}`;
    }

    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
        familyToURLParam(family)
    )}:${variantParam}&display=${display}`;

    if (typeof document !== 'undefined') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        loadedFamilies.add(family);
    }
}

export function ensureFontLoaded(family: string) {
    loadGoogleFont(family, { weights: [400, 500, 600, 700], italics: false, display: 'swap' });
}

export function isFontLoaded(family: string): boolean {
    return loadedFamilies.has(family);
}
