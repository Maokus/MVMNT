// Image scene element for displaying images with transformations and property bindings
import { SceneElement } from './base';
import { Image, AnimatedGif, RenderObject } from '@core/render/render-objects';
import { EnhancedConfigSchema } from '@core/types.js';

export class ImageElement extends SceneElement {
    private _currentImageSource: string | null = null;
    private _cachedRenderObject: RenderObject | null = null;

    constructor(id: string = 'image', config: { [key: string]: any } = {}) {
        super('image', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            name: 'Image',
            description: 'Display an image with transformations',
            category: 'media',
            groups: [
                ...base.groups,
                {
                    id: 'content',
                    label: 'Content',
                    collapsed: false,
                    properties: [
                        {
                            key: 'imageSource',
                            type: 'file',
                            label: 'Image File',
                            default: '',
                            accept: 'image/*',
                            description: 'Image file to display',
                        },
                        {
                            key: 'playbackSpeed',
                            type: 'number',
                            label: 'Playback Speed',
                            default: 1,
                            min: 0.1,
                            max: 10,
                            step: 0.1,
                            description: 'Speed multiplier for animated GIFs (1 = normal)',
                        },
                    ],
                },
                {
                    id: 'layout',
                    label: 'Layout',
                    collapsed: false,
                    properties: [
                        {
                            key: 'width',
                            type: 'number',
                            label: 'Width',
                            default: 200,
                            min: 10,
                            max: 2000,
                            step: 10,
                            description: 'Width of the image container in pixels',
                        },
                        {
                            key: 'height',
                            type: 'number',
                            label: 'Height',
                            default: 200,
                            min: 10,
                            max: 2000,
                            step: 10,
                            description: 'Height of the image container in pixels',
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
                            description: 'How the image should fit within its bounds',
                        },
                        {
                            key: 'preserveAspectRatio',
                            type: 'boolean',
                            label: 'Preserve Aspect Ratio',
                            default: true,
                            description: 'Whether to maintain the original aspect ratio',
                        },
                    ],
                },
            ],
        };
    }

    /**
     * Handle image source - convert File objects to data URLs
     */
    private _handleImageSource(source: any): void {
        // If it's a File object (from macro), convert to data URL
        if (source instanceof File) {
            console.log('Converting File object to data URL for bound image element:', source.name);
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    this._currentImageSource = e.target.result as string;
                    console.log('Successfully converted File to data URL');
                }
            };
            reader.onerror = (error) => {
                console.error('Error converting File to data URL:', error);
                this._currentImageSource = null;
            };
            reader.readAsDataURL(source);
        } else {
            // It's already a string URL or data URL
            this._currentImageSource = source;
        }
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        if (!this.getProperty('visible')) return [];

        // Get image source and handle File objects
        const imageSource = this.getProperty('imageSource');
        if (imageSource !== this._currentImageSource) {
            this._handleImageSource(imageSource);
        }

        if (!this._currentImageSource) return [];

        // Get all properties from bindings
        const width = this.getProperty('width') as number;
        const height = this.getProperty('height') as number;
        const fitMode = this.getProperty('fitMode') as 'contain' | 'cover' | 'fill' | 'none';
        const preserveAspectRatio = this.getProperty('preserveAspectRatio') as boolean;

        const playbackSpeed = (this.getProperty('playbackSpeed') as number) || 1;
        const isGif =
            typeof this._currentImageSource === 'string' &&
            (this._currentImageSource.toLowerCase().includes('.gif') ||
                this._currentImageSource.startsWith('data:image/gif'));

        // Recreate cached object only if source type changes or source string changes
        if (
            !this._cachedRenderObject ||
            (isGif && !(this._cachedRenderObject instanceof AnimatedGif)) ||
            (!isGif && !(this._cachedRenderObject instanceof Image)) ||
            (isGif && (this._cachedRenderObject as any).source !== this._currentImageSource) ||
            (!isGif && (this._cachedRenderObject as any).imageSource !== this._currentImageSource)
        ) {
            if (isGif) {
                this._cachedRenderObject = new AnimatedGif(
                    0,
                    0,
                    width,
                    height,
                    this._currentImageSource,
                    playbackSpeed,
                    1
                );
            } else {
                this._cachedRenderObject = new Image(
                    0,
                    0,
                    width,
                    height,
                    this._currentImageSource,
                    1 // element opacity handled by transform system
                );
            }
        }

        // Update dynamic properties
        if (isGif && this._cachedRenderObject instanceof AnimatedGif) {
            this._cachedRenderObject
                .setDimensions(width, height)
                .setPlaybackSpeed(playbackSpeed)
                .setFitMode(fitMode)
                .setPreserveAspectRatio(preserveAspectRatio);
        } else if (this._cachedRenderObject instanceof Image) {
            this._cachedRenderObject
                .setDimensions(width, height)
                .setFitMode(fitMode)
                .setPreserveAspectRatio(preserveAspectRatio);
        }

        return [this._cachedRenderObject];
    }
}
