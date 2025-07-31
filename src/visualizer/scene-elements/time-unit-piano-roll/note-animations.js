// NoteAnimations - creates RenderObjects for different animation states
// Refactored from animation.js to create RenderObjects instead of direct rendering
import { Rectangle } from '../../render-objects/index.js';
import { Easing } from '../../easing.js';

export class NoteAnimations {
    constructor() {
        // Animation presets and configurations
        this.easingFunctions = {
            linear: (t) => t,
            easeIn: Easing.easeIn,
            easeOut: Easing.easeOut,
            easeInOut: Easing.easeInOut,
            easeInOutQuad: Easing.easeInOutQuad
        };
    }

    // Create static note (no animation)
    createStaticNote(block, x, y, width, height, color) {
        const note = new Rectangle(x, y, width, height, color);
        note.globalAlpha = 0.8;
        return [note];
    }

    // Create sustained note (between animations)
    createSustainedNote(block, x, y, width, height, color) {
        const note = new Rectangle(x, y, width, height, color);
        note.globalAlpha = 0.8;

        // Add glow effect if note is currently playing
        if (block.isCurrentlyPlaying && block.isCurrentlyPlaying(performance.now() / 1000)) {
            note.shadowColor = color;
            note.shadowBlur = 10;
        }

        return [note];
    }

    // Create onset animation render objects
    createOnsetAnimation(block, x, y, width, height, color, animationType, progress) {
        const easedProgress = this.easingFunctions.easeInOutQuad(progress);

        switch (animationType) {
            case 'fade':
                return this._createFadeOnset(x, y, width, height, color, easedProgress);
            case 'slide':
                return this._createSlideOnset(x, y, width, height, color, easedProgress);
            case 'scale':
                return this._createScaleOnset(x, y, width, height, color, easedProgress);
            case 'expand':
            default:
                return this._createExpandOnset(x, y, width, height, color, easedProgress);
        }
    }

    // Create offset animation render objects
    createOffsetAnimation(block, x, y, width, height, color, animationType, progress) {
        const easedProgress = this.easingFunctions.easeIn(progress);

        switch (animationType) {
            case 'fade':
                return this._createFadeOffset(x, y, width, height, color, easedProgress);
            case 'slide':
                return this._createSlideOffset(x, y, width, height, color, easedProgress);
            case 'scale':
                return this._createScaleOffset(x, y, width, height, color, easedProgress);
            case 'expand':
            default:
                return this._createExpandOffset(x, y, width, height, color, easedProgress);
        }
    }

    // Fade onset animation
    _createFadeOnset(x, y, width, height, color, progress) {
        const note = new Rectangle(x, y, width, height, color);
        note.globalAlpha = 0.8 * progress;
        return [note];
    }

    // Fade offset animation
    _createFadeOffset(x, y, width, height, color, progress) {
        const note = new Rectangle(x, y, width, height, color);
        note.globalAlpha = 0.8 * (1 - progress);
        return [note];
    }

    // Expand onset animation (grows from left to right)
    _createExpandOnset(x, y, width, height, color, progress) {
        const expandedWidth = width * progress;
        const note = new Rectangle(x, y, Math.max(1, expandedWidth), height, color);
        note.globalAlpha = 0.8;
        return [note];
    }

    // Expand offset animation (contracts from right to left)
    _createExpandOffset(x, y, width, height, color, progress) {
        const remainingWidth = width * (1 - progress);
        const note = new Rectangle(x, y, Math.max(1, remainingWidth), height, color);
        note.globalAlpha = 0.8;
        return [note];
    }

    // Scale onset animation (scales from center)
    _createScaleOnset(x, y, width, height, color, progress) {
        const scaleX = progress;
        const scaleY = progress;

        const scaledWidth = width * scaleX;
        const scaledHeight = height * scaleY;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        const note = new Rectangle(
            x + offsetX,
            y + offsetY,
            Math.max(1, scaledWidth),
            Math.max(1, scaledHeight),
            color
        );
        note.globalAlpha = 0.8;
        return [note];
    }

    // Scale offset animation (scales down to center)
    _createScaleOffset(x, y, width, height, color, progress) {
        const scaleX = 1 - progress;
        const scaleY = 1 - progress;

        const scaledWidth = width * scaleX;
        const scaledHeight = height * scaleY;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;

        const note = new Rectangle(
            x + offsetX,
            y + offsetY,
            Math.max(1, scaledWidth),
            Math.max(1, scaledHeight),
            color
        );
        note.globalAlpha = 0.8;
        return [note];
    }

    // Slide onset animation (slides in from left)
    _createSlideOnset(x, y, width, height, color, progress) {
        const slideOffset = width * (1 - progress);
        const note = new Rectangle(x - slideOffset, y, width, height, color);
        note.globalAlpha = 0.8 * progress;
        return [note];
    }

    // Slide offset animation (slides out to right)
    _createSlideOffset(x, y, width, height, color, progress) {
        const slideOffset = width * progress;
        const note = new Rectangle(x + slideOffset, y, width, height, color);
        note.globalAlpha = 0.8 * (1 - progress);
        return [note];
    }

    // Create multiple animation variants for complex effects
    createComplexAnimation(block, x, y, width, height, color, animationType, progress, animationPhase) {
        // This can be extended for more complex animations that use multiple render objects
        // For example, particle effects, trail effects, etc.

        const baseObjects = this.createOnsetAnimation(block, x, y, width, height, color, animationType, progress);

        // Add additional effects based on animation phase
        if (animationPhase === 'peak' && progress > 0.8) {
            // Add highlight effect at peak
            const highlight = new Rectangle(x, y, width, height, this._brightenColor(color));
            highlight.globalAlpha = 0.3 * (progress - 0.8) / 0.2;
            baseObjects.push(highlight);
        }

        return baseObjects;
    }

    // Utility methods
    _brightenColor(color) {
        // Simple color brightening for highlight effects
        if (color.startsWith('#')) {
            // Convert hex to RGB, brighten, convert back
            const r = parseInt(color.substr(1, 2), 16);
            const g = parseInt(color.substr(3, 2), 16);
            const b = parseInt(color.substr(5, 2), 16);

            const brightenFactor = 1.3;
            const newR = Math.min(255, Math.floor(r * brightenFactor));
            const newG = Math.min(255, Math.floor(g * brightenFactor));
            const newB = Math.min(255, Math.floor(b * brightenFactor));

            return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
        }
        return color; // Fallback to original color
    }

    _calculateAnimationTiming(startTime, endTime, currentTime, duration) {
        // Helper for complex timing calculations
        const noteLifetime = endTime - startTime;
        const currentPosition = (currentTime - startTime) / noteLifetime;

        return {
            lifetime: noteLifetime,
            position: Math.max(0, Math.min(1, currentPosition)),
            phase: currentPosition < 0.1 ? 'onset' :
                currentPosition > 0.9 ? 'offset' : 'sustained'
        };
    }

    // Animation factory method for easy creation
    static createAnimation(type, animationType, progress, block, x, y, width, height, color) {
        const animations = new NoteAnimations();

        switch (type) {
            case 'onset':
                return animations.createOnsetAnimation(block, x, y, width, height, color, animationType, progress);
            case 'offset':
                return animations.createOffsetAnimation(block, x, y, width, height, color, animationType, progress);
            case 'sustained':
                return animations.createSustainedNote(block, x, y, width, height, color);
            case 'static':
            default:
                return animations.createStaticNote(block, x, y, width, height, color);
        }
    }
}
