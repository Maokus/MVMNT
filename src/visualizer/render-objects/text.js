// Text RenderObject for drawing text elements
import { RenderObject } from './base.js';

export class Text extends RenderObject {
    constructor(x, y, text, font = '16px Arial', color = '#FFFFFF', align = 'left', baseline = 'top') {
        // Validate and clamp extreme position values to prevent layout issues
        const maxPosition = 1000000; // 1 million pixels should be more than enough for any reasonable canvas
        const clampedX = Math.max(-maxPosition, Math.min(maxPosition, x));
        const clampedY = Math.max(-maxPosition, Math.min(maxPosition, y));

        if (clampedX !== x || clampedY !== y) {
            console.warn(`Text constructor: Extreme position values clamped - original: (${x}, ${y}), clamped: (${clampedX}, ${clampedY})`);
        }

        super(clampedX, clampedY);
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
        // For more accurate bounds, we need better text measurement
        // This is still an approximation but more accurate than before
        const fontSize = this._extractFontSize(this.font);

        // Validate inputs first
        if (!isFinite(this.x) || !isFinite(this.y) || !isFinite(fontSize)) {
            console.warn(`Text getBounds: Invalid values detected - x=${this.x}, y=${this.y}, fontSize=${fontSize}, font=${this.font}`);
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        // Improved character width estimation based on font type
        let charWidthRatio = 0.6; // Default for Arial/Helvetica
        if (this.font.toLowerCase().includes('mono')) {
            charWidthRatio = 0.6; // Monospace fonts
        } else if (this.font.toLowerCase().includes('serif')) {
            charWidthRatio = 0.55; // Serif fonts tend to be narrower
        } else if (this.font.toLowerCase().includes('bold')) {
            charWidthRatio = 0.65; // Bold fonts are wider
        }

        const estimatedWidth = this.text.length * fontSize * charWidthRatio;
        const estimatedHeight = fontSize * 1.3; // Include ascenders/descenders

        // Adjust bounds based on text alignment
        let boundsX = this.x;
        let boundsY = this.y;

        switch (this.align) {
            case 'center':
                boundsX = this.x - estimatedWidth / 2;
                break;
            case 'right':
                boundsX = this.x - estimatedWidth;
                break;
            default:
                // 'left' is default - no adjustment needed
                break;
        }

        switch (this.baseline) {
            case 'middle':
                boundsY = this.y - estimatedHeight / 2;
                break;
            case 'bottom':
                boundsY = this.y - estimatedHeight;
                break;
            case 'alphabetic':
                boundsY = this.y - estimatedHeight * 0.8; // Rough baseline adjustment
                break;
            default:
                // 'top' is default - no adjustment needed
                break;
        }

        const result = {
            x: boundsX,
            y: boundsY,
            width: estimatedWidth,
            height: estimatedHeight
        };

        // Validate final result
        if (!isFinite(result.x) || !isFinite(result.y) || !isFinite(result.width) || !isFinite(result.height) ||
            result.width < 0 || result.height < 0) {
            console.warn(`Text getBounds: Invalid result detected`, {
                text: this.text,
                font: this.font,
                position: { x: this.x, y: this.y },
                align: this.align,
                baseline: this.baseline,
                result: result
            });
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        return result;
    }

    // Helper method to extract font size from font string
    _extractFontSize(fontString) {
        const match = fontString.match(/(\d+)px/);
        if (match) {
            return parseInt(match[1]);
        }
        // Fallback: try to find any number in the font string
        const numberMatch = fontString.match(/(\d+)/);
        return numberMatch ? parseInt(numberMatch[1]) : 16;
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
