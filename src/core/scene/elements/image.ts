// Image scene element for displaying images with transformations and property bindings
import { SceneElement } from './base';
import { Image, AnimatedGif, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';
import { imageLoader, LoadedGIF } from '@core/resources/image-loader';

interface GIFFrameDataProviderImpl {
    getFrame(currentTime: number): {
        image: ImageBitmap | HTMLCanvasElement | ImageData | null;
        width: number;
        height: number;
    };
    isReady(): boolean;
    getStatus(): 'idle' | 'loading' | 'ready' | 'error';
}

export class ImageElement extends SceneElement {
    private _currentImageSource: string | File | null = null;
    private _cachedRenderObject: RenderObject | null = null;
    private _imgElement: HTMLImageElement | null = null;
    private _gifData: LoadedGIF | null = null;
    private _gifBitmaps: (ImageBitmap | null)[] = [];
    private _gifDecoding = false;
    private _status: 'idle' | 'loading' | 'ready' | 'error' | 'empty' = 'idle';

    constructor(id: string = 'image', config: { [key: string]: any } = {}) {
        super('image', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const baseBasicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const baseAdvancedGroups = base.groups.filter((group) => group.variant === 'advanced');
        return {
            name: 'Image',
            description: 'Display an image with transformations',
            category: 'Layout',
            groups: [
                ...baseBasicGroups,
                {
                    id: 'imageSource',
                    label: 'Image Source',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Pick the artwork and playback speed for animated assets.',
                    properties: [
                        {
                            key: 'imageSource',
                            type: 'file',
                            label: 'Image File',
                            default: '',
                            accept: 'image/*',
                            description: 'Image or animated GIF to display.',
                        },
                        {
                            key: 'playbackSpeed',
                            type: 'number',
                            label: 'Playback Speed (×)',
                            default: 1,
                            min: 0.1,
                            max: 10,
                            step: 0.1,
                            description: 'Speed multiplier for animated GIFs (1 = normal).',
                        },
                    ],
                    presets: [
                        { id: 'stillImage', label: 'Still Image', values: { playbackSpeed: 1 } },
                        { id: 'slowLoop', label: 'Slow GIF Loop', values: { playbackSpeed: 0.5 } },
                        { id: 'hyperLoop', label: 'Hyper GIF Loop', values: { playbackSpeed: 2 } },
                    ],
                },
                {
                    id: 'imageLayout',
                    label: 'Layout',
                    variant: 'basic',
                    collapsed: false,
                    description: 'Size and crop behaviour for the image frame.',
                    properties: [
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width (px)',
                            default: 200,
                            min: 10,
                            max: 2000,
                            step: 10,
                            description: 'Width of the image container in pixels.',
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height (px)',
                            default: 200,
                            min: 10,
                            max: 2000,
                            step: 10,
                            description: 'Height of the image container in pixels.',
                        },
                        {
                            key: 'fitMode',
                            type: 'select',
                            label: 'Fit Mode',
                            default: 'contain',
                            options: [
                                { value: 'contain', label: 'Contain (fit within bounds)' },
                                { value: 'cover', label: 'Cover (fill bounds, may crop)' },
                                { value: 'fill', label: 'Fill (stretch to fit)' },
                                { value: 'none', label: 'None (original size)' },
                            ],
                            description: 'How the image should fit within its bounds.',
                        },
                        {
                            key: 'preserveAspectRatio',
                            type: 'boolean',
                            label: 'Preserve Aspect Ratio',
                            default: true,
                            description: 'Maintain the original proportions when resizing.',
                            visibleWhen: [{ key: 'fitMode', notEquals: 'fill' }],
                        },
                    ],
                    presets: [
                        {
                            id: 'fullWidth',
                            label: 'Full Width Banner',
                            values: { width: 1280, height: 720, fitMode: 'cover' },
                        },
                        {
                            id: 'squareThumb',
                            label: 'Square Thumbnail',
                            values: { width: 512, height: 512, fitMode: 'contain' },
                        },
                    ],
                },
                ...baseAdvancedGroups,
            ],
        };
    }

    private _isGifSource(src: string | File | null): boolean {
        if (!src) return false;
        if (typeof src === 'string') return /\.gif($|\?)/i.test(src) || src.startsWith('data:image/gif');
        return /\.gif$/i.test(src.name);
    }

    private async _loadStaticImage(src: string | File) {
        this._status = 'loading';
        try {
            const img = await imageLoader.loadImage(src);
            this._imgElement = img;
            this._gifData = null;
            this._gifBitmaps = [];
            this._status = 'ready';
            document?.dispatchEvent?.(
                new CustomEvent('imageLoaded', { detail: { imageSource: typeof src === 'string' ? src : img.src } })
            );
        } catch (e) {
            console.warn('Image load failed', e);
            this._imgElement = null;
            this._status = 'error';
        }
    }

    private async _loadGif(src: string | File) {
        if (this._gifDecoding) return;
        this._gifDecoding = true;
        this._status = 'loading';
        try {
            const data = await imageLoader.loadGIF(src);
            this._gifData = data;
            this._imgElement = null;
            this._gifBitmaps = new Array(data.frames.length).fill(null);
            this._status = 'ready';
            document?.dispatchEvent?.(
                new CustomEvent('imageLoaded', {
                    detail: { imageSource: typeof src === 'string' ? src : 'gif', type: 'gif' },
                })
            );
        } catch (e) {
            console.warn('GIF load failed', e);
            this._gifData = null;
            this._status = 'error';
        } finally {
            this._gifDecoding = false;
        }
    }

    private _ensureBitmap(frameIndex: number) {
        if (!this._gifData) return null;
        if (!('createImageBitmap' in window)) return null;
        if (this._gifBitmaps[frameIndex]) return this._gifBitmaps[frameIndex];
        const frame = this._gifData.frames[frameIndex];
        createImageBitmap(frame.image)
            .then((bmp) => {
                this._gifBitmaps[frameIndex] = bmp;
            })
            .catch(() => {});
        return null;
    }

    private _getGifFrameProvider(): GIFFrameDataProviderImpl | null {
        if (!this._gifData) return null;
        const data = this._gifData;
        return {
            getStatus: () => (this._status === 'ready' ? 'ready' : this._status === 'error' ? 'error' : 'loading'),
            isReady: () => !!data && data.frames.length > 0,
            getFrame: (timeSeconds: number) => {
                if (!data || data.frames.length === 0) return { image: null, width: 0, height: 0 };
                const total = data.totalDurationMs;
                const tMs = (timeSeconds * 1000) % total;
                let acc = 0;
                let idx = 0;
                for (let i = 0; i < data.frames.length; i++) {
                    acc += data.frames[i].delay;
                    if (tMs < acc) {
                        idx = i;
                        break;
                    }
                }
                const frame = data.frames[idx];
                let img: ImageBitmap | HTMLCanvasElement | ImageData = frame.image;
                const bmp = this._gifBitmaps[idx];
                if (bmp) img = bmp;
                else this._ensureBitmap(idx);
                return { image: img, width: frame.image.width, height: frame.image.height };
            },
        };
    }

    private _maybeStartLoad(newSrc: any) {
        this._imgElement = null;
        this._gifData = null;
        this._gifBitmaps = [];
        if (!newSrc) {
            this._status = 'empty';
            return;
        }
        if (this._isGifSource(newSrc)) this._loadGif(newSrc);
        else this._loadStaticImage(newSrc);
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        const rawSource = this.getProperty('imageSource');
        if (rawSource !== this._currentImageSource) {
            this._currentImageSource = (rawSource as string | File | null) ?? null;
            this._maybeStartLoad(this._currentImageSource);
        }

        const width = this.getProperty('width') as number;
        const height = this.getProperty('height') as number;
        const fitMode = this.getProperty('fitMode') as 'contain' | 'cover' | 'fill' | 'none';
        const preserveAspectRatio = this.getProperty('preserveAspectRatio') as boolean;
        const playbackSpeed = (this.getProperty('playbackSpeed') as number) || 1;
        const isGif = this._isGifSource(this._currentImageSource);

        if (!this._cachedRenderObject || isGif !== this._cachedRenderObject instanceof AnimatedGif) {
            if (isGif) {
                const provider = this._getGifFrameProvider();
                this._cachedRenderObject = new AnimatedGif(0, 0, width, height, provider, playbackSpeed, 1, {
                    fitMode,
                    preserveAspectRatio,
                    status: this._status,
                });
            } else {
                this._cachedRenderObject = new Image(0, 0, width, height, this._imgElement, 1, {
                    fitMode,
                    preserveAspectRatio,
                    status: this._status,
                });
            }
        }

        if (isGif && this._cachedRenderObject instanceof AnimatedGif) {
            const provider = this._getGifFrameProvider();
            this._cachedRenderObject
                .setDimensions(width, height)
                .setPlaybackSpeed(playbackSpeed)
                .setFitMode(fitMode)
                .setPreserveAspectRatio(preserveAspectRatio)
                .setProvider(provider, this._status === 'empty' ? 'idle' : this._status);
        } else if (this._cachedRenderObject instanceof Image) {
            this._cachedRenderObject
                .setDimensions(width, height)
                .setFitMode(fitMode)
                .setPreserveAspectRatio(preserveAspectRatio)
                .setImageElement(this._imgElement, this._status === 'ready' ? 'ready' : this._status);
        }

        return [this._cachedRenderObject];
    }
}
