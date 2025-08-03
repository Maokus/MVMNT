// Image RenderObject for drawing images with transformations
import { RenderObject } from './base.js';

export class Image extends RenderObject {
    constructor(x, y, width, height, imageSource, opacity = 1) {
        // Make sure opacity is correctly passed to parent class
        super(x, y, 1, 1, opacity);
        this.width = width;
        this.height = height;
        this.imageSource = imageSource; // Can be URL, base64, or HTMLImageElement
        this.imageElement = null;
        this.imageLoaded = false;
        this.preserveAspectRatio = true;
        this.fitMode = 'contain'; // 'contain', 'cover', 'fill', 'none'

        // Debug
        console.log('Image created with opacity:', opacity);

        // Initialize image loading
        this._loadImage();
    }

    /**
     * Load the image from the source
     */
    _loadImage() {
        // Don't try to load null/undefined sources
        if (!this.imageSource) {
            this.imageElement = null;
            this.imageLoaded = false;
            return;
        }

        // Track image source to detect duplicate loads
        this._currentLoadingSource = this.imageSource;

        if (this.imageSource instanceof HTMLImageElement) {
            this.imageElement = this.imageSource;
            this.imageLoaded = this.imageElement.complete;
            if (!this.imageLoaded) {
                this.imageElement.onload = () => {
                    // Check if this is still the current image we're trying to load
                    if (this._currentLoadingSource !== this.imageSource) {
                        console.log('Image load event received but source has changed, ignoring');
                        return;
                    }

                    this.imageLoaded = true;
                    // Force a redraw if possible
                    if (this.onLoadCallback) this.onLoadCallback();
                    // Trigger automatic re-render when image loads
                    document.dispatchEvent(new CustomEvent('imageLoaded', {
                        detail: { imageSource: this.imageSource }
                    }));
                };
            } else {
                // Image is already loaded, no need to trigger an event
                console.log('Image is already loaded, skipping event');
            }
        } else if (typeof this.imageSource === 'string') {
            this.imageElement = document.createElement('img');
            this.imageElement.crossOrigin = 'anonymous'; // Allow CORS images

            // Set up load handler before setting src
            this.imageElement.onload = () => {
                // Check if this is still the current image we're trying to load
                if (this._currentLoadingSource !== this.imageSource) {
                    console.log('Image load event received but source has changed, ignoring');
                    return;
                }

                console.log('Image loaded successfully:', this.imageSource.substring(0, 50) + '...');
                this.imageLoaded = true;
                // Force a redraw if possible
                if (this.onLoadCallback) this.onLoadCallback();
                // Trigger automatic re-render when image loads
                document.dispatchEvent(new CustomEvent('imageLoaded', {
                    detail: { imageSource: this.imageSource }
                }));
            }; this.imageElement.onerror = (error) => {
                console.warn('Failed to load image:', error);
                this.imageLoaded = false;
            };

            // For data URLs, we need to ensure they're properly formatted
            if (this.imageSource.startsWith('data:')) {
                this.imageElement.src = this.imageSource;
            } else {
                // For regular URLs
                this.imageElement.src = this.imageSource;
            }
        }
    }

    /**
     * Calculate dimensions and position based on fit mode
     */
    _calculateDrawParams() {
        if (!this.imageElement || !this.imageLoaded) {
            return {
                drawX: 0,
                drawY: 0,
                drawWidth: this.width,
                drawHeight: this.height
            };
        }

        const imgWidth = this.imageElement.naturalWidth || this.imageElement.width;
        const imgHeight = this.imageElement.naturalHeight || this.imageElement.height;

        if (!this.preserveAspectRatio || this.fitMode === 'fill') {
            return {
                drawX: 0,
                drawY: 0,
                drawWidth: this.width,
                drawHeight: this.height
            };
        }

        const containerAspect = this.width / this.height;
        const imageAspect = imgWidth / imgHeight;

        let drawWidth, drawHeight, drawX, drawY;

        if (this.fitMode === 'contain') {
            if (imageAspect > containerAspect) {
                // Image is wider - fit to width
                drawWidth = this.width;
                drawHeight = this.width / imageAspect;
                drawX = 0;
                drawY = (this.height - drawHeight) / 2;
            } else {
                // Image is taller - fit to height
                drawHeight = this.height;
                drawWidth = this.height * imageAspect;
                drawX = (this.width - drawWidth) / 2;
                drawY = 0;
            }
        } else if (this.fitMode === 'cover') {
            if (imageAspect > containerAspect) {
                // Image is wider - fit to height, crop width
                drawHeight = this.height;
                drawWidth = this.height * imageAspect;
                drawX = (this.width - drawWidth) / 2;
                drawY = 0;
            } else {
                // Image is taller - fit to width, crop height
                drawWidth = this.width;
                drawHeight = this.width / imageAspect;
                drawX = 0;
                drawY = (this.height - drawHeight) / 2;
            }
        } else { // 'none'
            drawWidth = Math.min(imgWidth, this.width);
            drawHeight = Math.min(imgHeight, this.height);
            drawX = (this.width - drawWidth) / 2;
            drawY = (this.height - drawHeight) / 2;
        }

        return { drawX, drawY, drawWidth, drawHeight };
    }

    _renderSelf(ctx, config, currentTime) {
        // Debug transformations - only log on first render or significant changes
        if (!this._lastDebuggedState ||
            this._lastDebuggedState.opacity !== this.opacity ||
            this._lastDebuggedState.rotation !== this.rotation ||
            this._lastDebuggedState.scaleX !== this.scaleX ||
            this._lastDebuggedState.scaleY !== this.scaleY) {

            console.log('Rendering image with transformations:', {
                opacity: this.opacity,
                rotation: this.rotation,
                scaleX: this.scaleX,
                scaleY: this.scaleY
            });

            // Update the last debugged state
            this._lastDebuggedState = {
                opacity: this.opacity,
                rotation: this.rotation,
                scaleX: this.scaleX,
                scaleY: this.scaleY
            };
        }

        // Store the callback for refreshing when image loads
        this.onLoadCallback = () => {
            if (ctx && ctx.canvas) {
                // Just redraw the current frame when the image loads
                console.log('Image loaded, triggering redraw');
                // Note: Event dispatch moved to _loadImage method
            }
        };

        if (!this.imageElement) {
            console.warn('No image element created');
            this._drawPlaceholder(ctx, 'No image', 'red');
            return;
        }

        if (!this.imageLoaded) {
            // Check if image is now loaded (could have happened since constructor)
            if (this.imageElement.complete && this.imageElement.naturalWidth > 0) {
                console.log('Image was already loaded but not detected');
                this.imageLoaded = true;
            } else {
                console.log('Image not loaded yet, showing placeholder');
                this._drawPlaceholder(ctx, 'Loading...', 'rgba(150, 150, 150, 0.8)');
                return;
            }
        }

        // Additional check to ensure the image is actually valid
        if (!this.imageElement.naturalWidth || !this.imageElement.naturalHeight) {
            console.warn('Image has invalid dimensions:', this.imageElement.naturalWidth, this.imageElement.naturalHeight);
            this._drawPlaceholder(ctx, 'Invalid image', 'rgba(255, 100, 100, 0.8)');
            return;
        }

        const { drawX, drawY, drawWidth, drawHeight } = this._calculateDrawParams();

        // Clip to container bounds if using cover mode
        if (this.fitMode === 'cover') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.clip();
        }

        try {
            // Only log detailed drawing parameters when debugging or on first successful render
            if (!this._hasBeenDrawnSuccessfully) {
                console.log('Drawing image with params:', {
                    imageWidth: this.imageElement.width,
                    imageHeight: this.imageElement.height,
                    naturalWidth: this.imageElement.naturalWidth,
                    naturalHeight: this.imageElement.naturalHeight,
                    drawX,
                    drawY,
                    drawWidth,
                    drawHeight
                });
            }

            ctx.drawImage(this.imageElement, drawX, drawY, drawWidth, drawHeight);

            // Log success only on first successful render
            if (!this._hasBeenDrawnSuccessfully) {
                console.log('Image drawn successfully');
                this._hasBeenDrawnSuccessfully = true;
            }
        } catch (error) {
            console.warn('Error drawing image:', error);
            // Draw error placeholder
            ctx.fillStyle = 'rgba(255, 100, 100, 0.3)';
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.6)';
            ctx.strokeRect(0, 0, this.width, this.height);
            ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Error drawing image', this.width / 2, this.height / 2);
        }

        if (this.fitMode === 'cover') {
            ctx.restore();
        }
    }

    /**
     * Update the image source
     */
    setImageSource(source) {
        // If source is identical to current source and image is already loaded, don't reload
        if (source === this.imageSource && this.imageLoaded && this.imageElement) {
            console.log('Image source unchanged, skipping reload');
            return this;
        }

        this.imageSource = source;
        this.imageLoaded = false;
        this._loadImage();
        return this;
    }

    /**
     * Set the fit mode for the image
     */
    setFitMode(mode) {
        this.fitMode = mode;
        return this;
    }

    /**
     * Set whether to preserve aspect ratio
     */
    setPreserveAspectRatio(preserve) {
        this.preserveAspectRatio = preserve;
        return this;
    }

    /**
     * Set dimensions
     */
    setDimensions(width, height) {
        this.width = width;
        this.height = height;
        return this;
    }

    /**
     * Draw a placeholder with message
     */
    _drawPlaceholder(ctx, message, textColor) {
        // Draw placeholder rectangle
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
        ctx.strokeRect(0, 0, this.width, this.height);

        // Draw placeholder text
        ctx.fillStyle = textColor || 'rgba(150, 150, 150, 0.8)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, this.width / 2, this.height / 2);
    }

    /**
     * Check if image is loaded and ready to render
     */
    isReady() {
        return this.imageElement && this.imageLoaded;
    }

    /**
     * Get bounding box for the image element
     */
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}
