export type DesktopRenderKind = 'video' | 'png';

export interface DesktopRenderRequest {
    inputName: string;
    bytes: Uint8Array;
    kind: DesktopRenderKind;
    preset?: 'social-square' | 'social-portrait' | 'hd-landscape' | 'transparent-png';
    range?: { start: number; end: number };
    width?: number;
    height?: number;
    fps?: number;
}

export interface ParsedRenderCommand {
    inputPath: string;
    outputPath: string;
    kind: DesktopRenderKind;
    preset?: DesktopRenderRequest['preset'];
    range?: { start: number; end: number };
    width?: number;
    height?: number;
    fps?: number;
    json: boolean;
}

export type DesktopAutomationProgress = {
    type: 'progress';
    progress: number;
    message: string;
};

export type DesktopAutomationResult =
    | { type: 'complete'; outputName?: string; bytesWritten?: number }
    | { type: 'error'; code: 'input' | 'render' | 'output'; message: string };

export type DesktopDeepLinkCommand =
    | { command: 'show-recovery' }
    | { command: 'show-storage' }
    | { command: 'open-community'; id?: string };

function positiveInteger(flag: string, value: string | undefined): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 16_384) throw new Error(`${flag} requires a positive integer up to 16384.`);
    return parsed;
}

export function parseRenderCommand(argv: string[]): ParsedRenderCommand | null {
    const marker = argv.indexOf('--render');
    if (marker < 0) return null;
    const inputPath = argv[marker + 1];
    if (!inputPath || inputPath.startsWith('--')) throw new Error('--render requires an input .mvt file.');
    const values = new Map<string, string>();
    let json = false;
    for (let index = marker + 2; index < argv.length; index++) {
        const flag = argv[index];
        if (flag === '--json') { json = true; continue; }
        if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
        const value = argv[++index];
        if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
        values.set(flag, value);
    }
    const outputPath = values.get('--output');
    if (!outputPath) throw new Error('--output is required.');
    const kindValue = values.get('--kind') ?? (/\.png$/i.test(outputPath) ? 'png' : 'video');
    if (kindValue !== 'video' && kindValue !== 'png') throw new Error('--kind must be video or png.');
    const preset = values.get('--preset');
    const presets = new Set(['social-square', 'social-portrait', 'hd-landscape', 'transparent-png']);
    if (preset && !presets.has(preset)) throw new Error(`Unknown preset: ${preset}`);
    let range: ParsedRenderCommand['range'];
    if (values.has('--range')) {
        const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(values.get('--range')!);
        if (!match || Number(match[1]) >= Number(match[2])) throw new Error('--range must be start:end in seconds, with end after start.');
        range = { start: Number(match[1]), end: Number(match[2]) };
    }
    return {
        inputPath,
        outputPath,
        kind: kindValue,
        preset: preset as ParsedRenderCommand['preset'],
        range,
        width: values.has('--width') ? positiveInteger('--width', values.get('--width')) : undefined,
        height: values.has('--height') ? positiveInteger('--height', values.get('--height')) : undefined,
        fps: values.has('--fps') ? positiveInteger('--fps', values.get('--fps')) : undefined,
        json,
    };
}

export function parseDeepLink(value: string): DesktopDeepLinkCommand | null {
    try {
        const url = new URL(value);
        if (url.protocol !== 'mvmnt:' || url.hostname !== 'automation') return null;
        const command = url.pathname.replace(/^\/+/, '');
        if (command === 'show-recovery') return { command };
        if (command === 'show-storage') return { command };
        if (command === 'open-community') {
            const id = url.searchParams.get('id')?.trim();
            return id && /^[a-z0-9_-]{1,80}$/i.test(id) ? { command, id } : { command };
        }
        return null;
    } catch {
        return null;
    }
}
