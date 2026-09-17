interface EyeDropperOpenOptions {
    signal?: AbortSignal;
}

interface EyeDropperResult {
    sRGBHex: string;
}

declare class EyeDropper {
    open(options?: EyeDropperOpenOptions): Promise<EyeDropperResult>;
}
