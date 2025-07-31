// Image scene element for displaying images with transformations
import { SceneElement } from './base.js';
import { Image } from '../render-objects/index.js';

export class ImageElement extends SceneElement {
    constructor(id = 'image', x = 0, y = 0, width = 200, height = 200, imageSource = null, config = {}) {
        super('image', id, { x, y, width, height, imageSource, ...config });
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageSource = imageSource;
        this.scaleX = 1;
        this.scaleY = 1;
        this.opacity = 1;
        this.rotation = 0;
        this.fitMode = 'contain';
        this.preserveAspectRatio = true;
        this._applyConfig();
    }

    static getConfigSchema() {
        return {
            name: 'Image',
            description: 'Display an image with transformations',
            category: 'media',
            properties: {
                ...super.getConfigSchema().properties,
                imageSource: {
                    type: 'file',
                    label: 'Image File',
                    accept: 'image/*',
                    description: 'Select an image file to display'
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

    _applyConfig() {
        super._applyConfig();

        // Debug configuration before applying
        console.log('Applying config to ImageElement:', this.config);

        if (this.config.x !== undefined) this.x = this.config.x;
        if (this.config.y !== undefined) this.y = this.config.y;
        if (this.config.width !== undefined) this.width = this.config.width;
        if (this.config.height !== undefined) this.height = this.config.height;
        if (this.config.imageSource !== undefined) this.imageSource = this.config.imageSource;
        if (this.config.scaleX !== undefined) {
            console.log(`Setting scaleX from ${this.scaleX} to ${this.config.scaleX}`);
            this.scaleX = parseFloat(this.config.scaleX);
        }
        if (this.config.scaleY !== undefined) {
            console.log(`Setting scaleY from ${this.scaleY} to ${this.config.scaleY}`);
            this.scaleY = parseFloat(this.config.scaleY);
        }
        if (this.config.opacity !== undefined) {
            console.log(`Setting opacity from ${this.opacity} to ${this.config.opacity}`);
            this.opacity = parseFloat(this.config.opacity);
        }
        if (this.config.rotation !== undefined) {
            console.log(`Setting rotation from ${this.rotation} to ${this.config.rotation}`);
            this.rotation = parseFloat(this.config.rotation);
        }
        if (this.config.fitMode !== undefined) this.fitMode = this.config.fitMode;
        if (this.config.preserveAspectRatio !== undefined) this.preserveAspectRatio = this.config.preserveAspectRatio;

        // Debug element state after applying config
        console.log('ImageElement state after applying config:', {
            id: this.id,
            opacity: this.opacity,
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY
        });
    }

    buildRenderObjects(config, targetTime) {
        if (!this.visible || !this.imageSource) return [];

        // Debug element state before rendering
        console.log('ImageElement state before building render objects:', {
            id: this.id,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            opacity: this.opacity,
            rotation: this.rotation,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            imageSource: typeof this.imageSource === 'string' ?
                (this.imageSource.startsWith('data:') ? 'data:URL' : this.imageSource) :
                'HTMLImageElement'
        });

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
        console.log(`Setting image rotation: ${this.rotation}° = ${rotationRad} radians`);

        // Apply fit mode and aspect ratio settings
        image.setFitMode(this.fitMode);
        image.setPreserveAspectRatio(this.preserveAspectRatio);

        // Debug the created render object
        console.log('Image render object created with:', {
            x: image.x,
            y: image.y,
            opacity: image.opacity,
            rotation: image.rotation,
            scaleX: image.scaleX,
            scaleY: image.scaleY
        });

        return [image];
    }

    // Setter methods for programmatic control
    setImageSource(source) {
        this.imageSource = source;
        return this;
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
        return this;
    }

    setScale(scaleX, scaleY = scaleX) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        return this;
    }

    setOpacity(opacity) {
        this.opacity = Math.max(0, Math.min(1, opacity));
        return this;
    }

    setRotation(degrees) {
        this.rotation = degrees;
        return this;
    }

    setFitMode(mode) {
        this.fitMode = mode;
        return this;
    }

    setPreserveAspectRatio(preserve) {
        this.preserveAspectRatio = preserve;
        return this;
    }
}
