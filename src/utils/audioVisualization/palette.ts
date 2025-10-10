export interface ChannelPaletteEntry {
    index: number;
    alias: string | null;
    label: string;
    color: string;
}

const CHANNEL_ALIAS_COLORS: Record<string, string> = {
    left: '#38bdf8',
    l: '#38bdf8',
    right: '#f472b6',
    r: '#f472b6',
    mid: '#a855f7',
    center: '#22c55e',
    c: '#22c55e',
    side: '#f97316',
    s: '#f97316',
    lfe: '#facc15',
    sub: '#facc15',
    mono: '#22c55e',
    surround: '#60a5fa',
    rear: '#fb7185',
};

const FALLBACK_COLORS = ['#38bdf8', '#f97316', '#22c55e', '#a855f7', '#facc15', '#f472b6', '#fb7185'];

function normalizeAlias(alias: string | null | undefined): string | null {
    if (!alias) return null;
    const trimmed = alias.trim();
    if (!trimmed) return null;
    return trimmed;
}

function resolveColor(alias: string | null, index: number): string {
    const normalized = alias?.toLowerCase();
    if (normalized && CHANNEL_ALIAS_COLORS[normalized]) {
        return CHANNEL_ALIAS_COLORS[normalized];
    }
    return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function channelColorPalette(
    trackChannels: Array<string | null | undefined> | number | null | undefined,
): ChannelPaletteEntry[] {
    let aliases: Array<string | null> = [];
    if (Array.isArray(trackChannels)) {
        aliases = trackChannels.map((alias) => normalizeAlias(alias));
    } else if (Number.isFinite(trackChannels) && (trackChannels as number) > 0) {
        const count = Math.max(0, Math.floor(trackChannels as number));
        aliases = Array.from({ length: count }, () => null);
    }

    return aliases.map((alias, index) => {
        const color = resolveColor(alias, index);
        return {
            index,
            alias,
            label: alias ?? `Channel ${index + 1}`,
            color,
        };
    });
}
