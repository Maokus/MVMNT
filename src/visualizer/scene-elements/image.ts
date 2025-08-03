// Image scene element for displaying images with transformations
import { SceneElement } from './base';
import { Image } from '../render-objects/index.js';
import { ConfigSchema, ImageElementConfig, RenderObjectInterface } from '../types.js';

export class ImageElement extends SceneElement {
    public x: number = 0;
    public y: number = 0;
    public width: number = 200;
    public height: number = 200;
    public imageSource: string | null = null;
    public scaleX: number = 1;
    public scaleY: number = 1;
    public opacity: number = 1;
    public rotation: number = 0;
    public fitMode: 'contain' | 'cover' | 'fill' | 'none' = 'contain';
    public preserveAspectRatio: boolean = true;

    constructor(
        id: string = 'image', 
        x: number = 0, 
        y: number = 0, 
        width: number = 200, 
        height: number = 200, 
        imageSource: string | null = null, 
        config: ImageElementConfig = {}
    ) {
        super('image', id, { x, y, width, height, imageSource, ...config });
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageSource = imageSource;
        this._applyConfig();
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
                    step: 0.05,
                    description: 'Image opacity (0 = transparent, 1 = opaque)'
                },
                rotation: {
                    type: 'range',
                    label: 'Rotation',
                    default: 0,
                    min: -180,
                    max: 180,
                    step: 5,
                    description: 'Rotation angle in degrees'
                },
                fitMode: {
                    type: 'select',
                    label: 'Fit Mode',
                    default: 'contain',
                    options: [
                        { value: 'contain', label: 'Contain (fit inside)' },
                        { value: 'cover', label: 'Cover (fill container)' },
                        { value: 'fill', label: 'Fill (stretch to fit)' },
                        { value: 'none', label: 'None (original size)' }
                    ],
                    description: 'How the image should fit within the container'
                },
                preserveAspectRatio: {
                    type: 'boolean',
                    label: 'Preserve Aspect Ratio',
                    default: true,
                    description: 'Maintain the original image proportions'
                }
            }
        };
    }

    protected _applyConfig(): void {
        super._applyConfig();

        if (this.config.x !== undefined) this.x = this.config.x;
        if (this.config.y !== undefined) this.y = this.config.y;
        if (this.config.width !== undefined) this.width = this.config.width;
        if (this.config.height !== undefined) this.height = this.config.height;
        if (this.config.imageSource !== undefined) this.imageSource = this.config.imageSource;
        if (this.config.scaleX !== undefined) {
            this.scaleX = parseFloat(this.config.scaleX);
        }
        if (this.config.scaleY !== undefined) {
            this.scaleY = parseFloat(this.config.scaleY);
        }
        if (this.config.opacity !== undefined) {
            this.opacity = parseFloat(this.config.opacity);
        }
        if (this.config.rotation !== undefined) {
            this.rotation = parseFloat(this.config.rotation);
        }
        if (this.config.fitMode !== undefined) this.fitMode = this.config.fitMode;
        if (this.config.preserveAspectRatio !== undefined) this.preserveAspectRatio = this.config.preserveAspectRatio;
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[] {
        if (!this.visible || !this.imageSource) return [];

        const image = new Image(
            this.x,
            this.y,
            this.width,
            this.height,
            this.imageSource,
            this.opacity
        );

        // Apply transformations
        image.scaleX = this.scaleX;
        image.scaleY = this.scaleY;

        // Convert rotation from degrees to radians
        const rotationRad = (this.rotation * Math.PI) / 180;
        image.rotation = rotationRad;

        // Apply fit mode and aspect ratio settings
        image.setFitMode(this.fitMode);
        image.setPreserveAspectRatio(this.preserveAspectRatio);

        return [image];
    }

    // Setter methods for programmatic control
    setImageSource(source: string): this {
        this.imageSource = source;
        return this;
    }

    setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }

    setDimensions(width: number, height: number): this {
        this.width = width;
        this.height = height;
        return this;
    }

    setScale(scaleX: number, scaleY: number = scaleX): this {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        return this;
    }

    setOpacity(opacity: number): this {
        this.opacity = Math.max(0, Math.min(1, opacity));
        return this;
    }

    setRotation(degrees: number): this {
        this.rotation = degrees;
        return this;
    }

    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'none'): this {
        this.fitMode = mode;
        return this;
    }

    setPreserveAspectRatio(preserve: boolean): this {
        this.preserveAspectRatio = preserve;
        return this;
    }
}
