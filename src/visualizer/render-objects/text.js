// Text RenderObject for drawing text elements
import { RenderObject } from './base.js';

export class Text extends RenderObject {
    constructor(x, y, text, font = '16px Arial', color = '#FFFFFF', align = 'left', baseline = 'top') {
        super(x, y);
        this.text = text;
        this.font = font;
        this.color = color;
        this.align = align;
        this.baseline = baseline;
        this.strokeColor = null;
        this.strokeWidth = 0;
        this.maxWidth = null; // For text wrapping
        this.shadow = null; // { color, blur, offsetX, offsetY }
    }

    _renderSelf(ctx, config, currentTime) {
        // Set text properties
        ctx.font = this.font;
        ctx.textAlign = this.align;
        ctx.textBaseline = this.baseline;

        // Apply shadow if specified
        if (this.shadow) {
            ctx.shadowColor = this.shadow.color;
            ctx.shadowBlur = this.shadow.blur;
            ctx.shadowOffsetX = this.shadow.offsetX;
            ctx.shadowOffsetY = this.shadow.offsetY;
        }

        // Draw stroke first (if specified)
        if (this.strokeColor && this.strokeWidth > 0) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            if (this.maxWidth !== null) {
                ctx.strokeText(this.text, 0, 0, this.maxWidth);
            } else {
                ctx.strokeText(this.text, 0, 0);
            }
        }

        // Draw fill text
        ctx.fillStyle = this.color;
        if (this.maxWidth !== null) {
            ctx.fillText(this.text, 0, 0, this.maxWidth);
        } else {
            ctx.fillText(this.text, 0, 0);
        }

        // Reset shadow
        if (this.shadow) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
    }

    setText(text) {
        this.text = text;
        return this;
    }

    setFont(font) {
        this.font = font;
        return this;
    }

    setColor(color) {
        this.color = color;
        return this;
    }

    setAlignment(align, baseline = this.baseline) {
        this.align = align;
        this.baseline = baseline;
        return this;
    }

    setStroke(color, width) {
        this.strokeColor = color;
        this.strokeWidth = width;
        return this;
    }

    setMaxWidth(width) {
        this.maxWidth = width;
        return this;
    }

    setShadow(color, blur, offsetX = 0, offsetY = 0) {
        this.shadow = { color, blur, offsetX, offsetY };
        return this;
    }

    // Helper method to measure text dimensions
    measureText(ctx) {
        const originalFont = ctx.font;
        ctx.font = this.font;
        const metrics = ctx.measureText(this.text);
        ctx.font = originalFont;
        return metrics;
    }

    getBounds() {
        // For more accurate bounds, we'd need canvas context, but this is a reasonable approximation
        // The actual font metrics would require access to the canvas context during measurement
        const fontSize = parseInt(this.font) || 16;
        const estimatedWidth = this.text.length * fontSize * 0.6; // Rough character width estimation
        const estimatedHeight = fontSize * 1.2; // Include line height

        return {
            x: this.x,
            y: this.y,
            width: estimatedWidth,
            height: estimatedHeight
        };
    }

    // Utility method to create common text styles
    static createTitle(x, y, text, config) {
        const fontSize = Math.max(config.canvas.height * 0.09, 24);
        const fontWeight = config.titleFontWeight || config.fontWeight || '400';
        const font = `${fontWeight} ${fontSize}px ${config.fontFamily || 'Arial'}, sans-serif`;

        return new Text(x, y, text, font, config.textColor || '#FFFFFF', 'left', 'top');
    }

    static createSubtitle(x, y, text, config) {
        const fontSize = Math.max(config.canvas.height * 0.036, 16);
        const fontWeight = config.artistFontWeight || config.fontWeight || '400';
        const font = `${fontWeight} ${fontSize}px ${config.fontFamily || 'Arial'}, sans-serif`;

        return new Text(x, y, text, font, config.textSecondaryColor || '#CCCCCC', 'left', 'top');
    }

    static createCounter(x, y, text, config) {
        const fontSize = Math.max(config.canvas.height * 0.03, 14);
        const fontWeight = config.fontWeight || '400';
        const font = `${fontWeight} ${fontSize}px ${config.fontFamily || 'Arial'}, sans-serif`;

        return new Text(x, y, text, font, config.textTertiaryColor || '#999999', 'right', 'top');
    }

    static createTimeDisplay(x, y, text, config) {
        const fontSize = Math.max(config.canvas.height * 0.035, 16);
        const fontWeight = config.fontWeight || '400';
        const font = `${fontWeight} ${fontSize}px ${config.fontFamily || 'Arial'}, sans-serif`;

        return new Text(x, y, text, font, config.textSecondaryColor || '#CCCCCC', 'right', 'bottom');
    }
}
