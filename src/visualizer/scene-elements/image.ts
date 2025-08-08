// Image scene element for displaying images with transformations and property bindings
import { SceneElement } from './base';
import { Image } from '../render-objects/index.js';
import { ConfigSchema, RenderObjectInterface } from '../types.js';

export class ImageElement extends SceneElement {
    private _currentImageSource: string | null = null;

    constructor(id: string = 'image', config: { [key: string]: any } = {}) {
        super('image', id, config);
    }

    static getConfigSchema(): ConfigSchema {
        return {
            name: 'Image',
            description: 'Display an image with transformations',
            category: 'media',
            properties: {
                ...super.getConfigSchema().properties,
                imageSource: {
                    type: 'file',
                    label: 'Image File',
                    default: '',
                    accept: 'image/*',
                    description: 'Image file to display'
                },
                x: {
                    type: 'number',
                    label: 'X Position',
                    default: 0,
                    step: 1,
                    description: 'Horizontal position in pixels'
                },
                y: {
                    type: 'number',
                    label: 'Y Position',
                    default: 0,
                    step: 1,
                    description: 'Vertical position in pixels'
                },
                width: {
                    type: 'number',
                    label: 'Width',
                    default: 200,
                    min: 10,
                    max: 2000,
                    step: 10,
                    description: 'Width of the image container in pixels'
                },
                height: {
                    type: 'number',
                    label: 'Height',
                    default: 200,
                    min: 10,
                    max: 2000,
                    step: 10,
                    description: 'Height of the image container in pixels'
                },
                scaleX: {
                    type: 'range',
                    label: 'Scale X',
                    default: 1,
                    min: 0.1,
                    max: 3,
                    step: 0.1,
                    description: 'Horizontal scale factor'
                },
                scaleY: {
                    type: 'range',
                    label: 'Scale Y',
                    default: 1,
                    min: 0.1,
                    max: 3,
                    step: 0.1,
                    description: 'Vertical scale factor'
                },
                opacity: {
                    type: 'range',
                    label: 'Opacity',
                    default: 1,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    description: 'Image opacity (0 = transparent, 1 = opaque)'
                },
                rotation: {
                    type: 'number',
                    label: 'Rotation (degrees)',
                    default: 0,
                    min: -360,
                    max: 360,
                    step: 1,
                    description: 'Rotation angle in degrees'
                },
                fitMode: {
                    type: 'select',
                    label: 'Fit Mode',
                    default: 'contain',
                    options: [
                        { value: 'contain', label: 'Contain (fit within bounds)' },
                        { value: 'cover', label: 'Cover (fill bounds, may crop)' },
                        { value: 'fill', label: 'Fill (stretch to fit)' },
                        { value: 'none', label: 'None (original size)' }
                    ],
                    description: 'How the image should fit within its bounds'
                },
                preserveAspectRatio: {
                    type: 'boolean',
                    label: 'Preserve Aspect Ratio',
                    default: true,
                    description: 'Whether to maintain the original aspect ratio'
                }
            }
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
        const x = this.getProperty('x') as number;
        const y = this.getProperty('y') as number;
        const width = this.getProperty('width') as number;
        const height = this.getProperty('height') as number;
        const scaleX = this.getProperty('scaleX') as number;
        const scaleY = this.getProperty('scaleY') as number;
        const opacity = this.getProperty('opacity') as number;
        const rotation = this.getProperty('rotation') as number;
        const fitMode = this.getProperty('fitMode') as 'contain' | 'cover' | 'fill' | 'none';
        const preserveAspectRatio = this.getProperty('preserveAspectRatio') as boolean;

        const image = new Image(
            x,
            y,
            width,
            height,
            this._currentImageSource,
            opacity
        );

        // Apply transformations
        image.scaleX = scaleX;
        image.scaleY = scaleY;

        // Convert rotation from degrees to radians
        const rotationRad = (rotation * Math.PI) / 180;
        image.rotation = rotationRad;

        // Apply fit mode and aspect ratio settings
        image.setFitMode(fitMode);
        image.setPreserveAspectRatio(preserveAspectRatio);

        return [image];
    }
}
