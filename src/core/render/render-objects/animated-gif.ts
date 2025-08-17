import { RenderObject, RenderConfig, Bounds } from './base';

export interface GIFFrameDataProvider {
    getFrame(currentTime: number): {
        image: ImageBitmap | HTMLCanvasElement | ImageData | null;
        width: number;
        height: number;
    };
    isReady(): boolean;
    getStatus(): 'idle' | 'loading' | 'ready' | 'error';
}

/** Lightweight AnimatedGif that draws frames supplied by a provider (scene element). */
export class AnimatedGif extends RenderObject {
    width: number;
    height: number;
    fitMode: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio: boolean;
    playbackSpeed: number; // maintained for layout adjustments / future scaling
    private _provider: GIFFrameDataProvider | null;
    private _status: 'idle' | 'loading' | 'ready' | 'error';

    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        provider: GIFFrameDataProvider | null,
        playbackSpeed: number,
        opacity = 1,
        options: {
            fitMode?: 'contain' | 'cover' | 'fill' | 'none';
            preserveAspectRatio?: boolean;
            status?: string;
        } = {}
    ) {
        super(x, y, 1, 1, opacity);
        this.width = width;
        this.height = height;
        this._provider = provider;
        this.playbackSpeed = playbackSpeed || 1;
        this.fitMode = options.fitMode ?? 'contain';
        this.preserveAspectRatio = options.preserveAspectRatio ?? true;
        this._status = (options.status as any) || 'idle';
    }

    setProvider(provider: GIFFrameDataProvider | null, status: 'idle' | 'loading' | 'ready' | 'error' = 'idle') {
        this._provider = provider;
        this._status = status;
        return this;
    }
    setPlaybackSpeed(speed: number) {
        this.playbackSpeed = Math.max(0.01, speed || 1);
        return this;
    }
    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'none') {
        this.fitMode = mode;
        return this;
    }
    setPreserveAspectRatio(val: boolean) {
        this.preserveAspectRatio = val;
        return this;
    }
    setDimensions(width: number, height: number) {
        this.width = width;
        this.height = height;
        return this;
    }
    setStatus(status: 'idle' | 'loading' | 'ready' | 'error') {
        this._status = status;
        return this;
    }

    #calculateDrawParams(imgWidth: number, imgHeight: number) {
        if (!this.preserveAspectRatio || this.fitMode === 'fill')
            return { drawX: 0, drawY: 0, drawWidth: this.width, drawHeight: this.height };
        const containerAspect = this.width / this.height;
        const imageAspect = imgWidth / imgHeight;
        let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
        if (this.fitMode === 'contain') {
            if (imageAspect > containerAspect) {
                drawWidth = this.width;
                drawHeight = this.width / imageAspect;
                drawX = 0;
                drawY = (this.height - drawHeight) / 2;
            } else {
                drawHeight = this.height;
                drawWidth = this.height * imageAspect;
                drawX = (this.width - drawWidth) / 2;
                drawY = 0;
            }
        } else if (this.fitMode === 'cover') {
            if (imageAspect > containerAspect) {
                drawHeight = this.height;
                drawWidth = this.height * imageAspect;
                drawX = (this.width - drawWidth) / 2;
                drawY = 0;
            } else {
                drawWidth = this.width;
                drawHeight = this.width / imageAspect;
                drawX = 0;
                drawY = (this.height - drawHeight) / 2;
            }
        } else {
            drawWidth = Math.min(imgWidth, this.width);
            drawHeight = Math.min(imgHeight, this.height);
            drawX = (this.width - drawWidth) / 2;
            drawY = (this.height - drawHeight) / 2;
        }
        return { drawX, drawY, drawWidth, drawHeight };
    }

    protected _renderSelf(ctx: CanvasRenderingContext2D, _config: RenderConfig, currentTime: number): void {
        const provider = this._provider;
        if (!provider) {
            this.#drawPlaceholder(ctx, this._status === 'loading' ? 'Loading' : 'No GIF');
            return;
        }
        if (!provider.isReady()) {
            this.#drawPlaceholder(ctx, this._status === 'error' ? 'GIF error' : 'Decoding');
            return;
        }
        const frameData = provider.getFrame(currentTime * this.playbackSpeed);
        if (!frameData || !frameData.image) {
            this.#drawPlaceholder(ctx, 'Empty');
            return;
        }
        const { image, width: imgWidth, height: imgHeight } = frameData;
        const { drawX, drawY, drawWidth, drawHeight } = this.#calculateDrawParams(imgWidth, imgHeight);
        try {
            if (
                image instanceof ImageBitmap ||
                image instanceof HTMLImageElement ||
                image instanceof HTMLCanvasElement
            ) {
                ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
            } else {
                // ImageData path
                const off = document.createElement('canvas');
                off.width = imgWidth;
                off.height = imgHeight;
                const offCtx = off.getContext('2d');
                if (offCtx) offCtx.putImageData(image, 0, 0);
                ctx.drawImage(off, drawX, drawY, drawWidth, drawHeight);
            }
        } catch (e) {
            this.#drawPlaceholder(ctx, 'Draw err');
        }
    }

    #drawPlaceholder(ctx: CanvasRenderingContext2D, msg: string) {
        ctx.fillStyle = 'rgba(200,200,200,0.3)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.strokeRect(0, 0, this.width, this.height);
        ctx.fillStyle = 'rgba(60,60,60,0.8)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, this.width / 2, this.height / 2);
    }

    isReady(): boolean {
        return !!this._provider && this._provider.isReady();
    }

    getBounds(): Bounds {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
