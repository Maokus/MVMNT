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

/**
 * Injects (or updates) a Google Fonts stylesheet link for the given family/weights.
 * Returns a list of the cumulative loaded weights after this call (synchronous part only).
 */
export function loadGoogleFont(family: string, options: LoadFontOptions = {}): number[] {
    if (!family) return [];
    const weights = options.weights?.length ? options.weights : [400, 700];
    const italics = options.italics ? true : false;
    const display = options.display || 'swap';
    const existing = loadedFamilies.get(family) || new Set<number>();
    // Determine which weights are new
    const newWeights = weights.filter((w) => !existing.has(w));
    if (newWeights.length === 0) return Array.from(existing);

    newWeights.forEach((w) => existing.add(w));
    loadedFamilies.set(family, existing);

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
        const id = `gf-${familyToURLParam(family)}`;
        // Re-use a single link element per family so we don't spam <head>
        let link = document.getElementById(id) as HTMLLinkElement | null;
        if (!link) {
            link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        link.href = href;
    }
    return allWeights;
}

/**
 * Loads a font family (and optional weights) and resolves once the browser reports the fonts are available.
 * Gracefully resolves after a timeout even if the Font Loading API isn't supported.
 */
export async function loadGoogleFontAsync(family: string, options: LoadFontOptions = {}): Promise<void> {
    const weights = loadGoogleFont(family, options); // inject / update link first
    if (typeof document === 'undefined' || !(document as any).fonts || !family) return; // SSR or unsupported
    const fontFaceSet: FontFaceSet = (document as any).fonts;
    // Use a reasonable sample size for load (using 32px to ensure glyph metrics stable)
    const promises = weights.map((w) => {
        try {
            return fontFaceSet.load(`${w} 32px '${family}'`).catch(() => Promise.resolve());
        } catch {
            return Promise.resolve();
        }
    });
    const timeout = new Promise<void>((resolve) => setTimeout(() => resolve(), 3500));
    await Promise.race([Promise.all(promises).then(() => undefined), timeout]);
    // Dispatch a custom event so UI / canvas can react
    try {
        window.dispatchEvent(new CustomEvent('font-loaded', { detail: { family, weights } }));
    } catch {
        /* no-op */
    }
}

export function ensureFontLoaded(family: string): Promise<void> {
    return loadGoogleFontAsync(family, { weights: [400, 500, 600, 700], italics: false, display: 'swap' });
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
