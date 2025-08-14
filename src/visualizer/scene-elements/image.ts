// Image scene element for displaying images with transformations and property bindings
import { SceneElement } from './base';
import { Image } from '../render-objects';
import { EnhancedConfigSchema, RenderObjectInterface } from '../types.js';

export class ImageElement extends SceneElement {
    private _currentImageSource: string | null = null;

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

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
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

        // Create image at origin (positioning and transformations handled by transform system)
        const image = new Image(
            0,
            0,
            width,
            height,
            this._currentImageSource,
            1 // Full opacity at render object level, element opacity is handled by transform system
        );

        // Apply fit mode and aspect ratio settings
        image.setFitMode(fitMode);
        image.setPreserveAspectRatio(preserveAspectRatio);

        return [image];
    }
}
