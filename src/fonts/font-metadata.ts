import opentype from 'opentype.js';

export interface ParsedFontMetadata {
    family: string;
    postscriptName?: string;
    weight: number;
    style: 'normal' | 'italic';
    variationAxes?: Record<string, number>;
}

function resolveSourceBuffer(input: File | Blob | ArrayBuffer): Promise<ArrayBuffer> {
    if (input instanceof ArrayBuffer) return Promise.resolve(input.slice(0));
    if (typeof input.arrayBuffer === 'function') {
        return input.arrayBuffer();
    }
    throw new Error('Unsupported font input');
}

export async function parseFontMetadata(input: File | Blob | ArrayBuffer): Promise<ParsedFontMetadata> {
    const buffer = await resolveSourceBuffer(input);
    const font = opentype.parse(buffer);
    const family = font.names.fullName?.en || font.names.fontFamily?.en || 'Custom Font';
    const postscriptName = font.names.postScriptName?.en;
    const weight = font.tables?.os2?.usWeightClass ?? 400;
    const italic = Boolean(font.tables?.os2?.fsSelection & 0x01);
    const variationAxes: Record<string, number> = {};
    if (font.tables?.fvar?.axes) {
        for (const axis of font.tables.fvar.axes) {
            variationAxes[axis.tag] = axis.defaultValue;
        }
    }
    return {
        family,
        postscriptName: typeof postscriptName === 'string' ? postscriptName : undefined,
        weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : 400,
        style: italic ? 'italic' : 'normal',
        variationAxes: Object.keys(variationAxes).length ? variationAxes : undefined,
    };
}
