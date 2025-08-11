// NoteAnimations - creates RenderObjects for different animation states
// Refactored to TypeScript to create RenderObjects instead of direct rendering
import { Rectangle } from '../../render-objects/index.js';
import { Easing } from '../../easing.js';
import type { RenderObjectInterface } from '../../types.js';
import type { NoteBlock } from './note-block';
import type { AnimationType } from './animation-controller';

export class NoteAnimations {
  private easingFunctions: Record<string, (t: number) => number>;

  constructor() {
    // Animation presets and configurations
    this.easingFunctions = {
      linear: (t: number) => t,
      easeIn: Easing.easeIn,
      easeOut: Easing.easeOut,
      easeInOut: Easing.easeInOut,
      easeInOutQuad: Easing.easeInOutQuad,
    };
  }

  // Create static note (no animation)
  createStaticNote(_block: NoteBlock, x: number, y: number, width: number, height: number, color: string): RenderObjectInterface[] {
    const note = new Rectangle(x, y, width, height, color);
    (note as any).globalAlpha = 0.8;
    return [note as unknown as RenderObjectInterface];
  }

  // Create sustained note (between animations)
  createSustainedNote(block: NoteBlock, x: number, y: number, width: number, height: number, color: string): RenderObjectInterface[] {
    const note = new Rectangle(x, y, width, height, color);
    (note as any).globalAlpha = 0.8;

    // Add glow effect if note is currently playing
    if ((block as any).isCurrentlyPlaying && (block as any).isCurrentlyPlaying(performance.now() / 1000)) {
      (note as any).shadowColor = color;
      (note as any).shadowBlur = 10;
    }

    return [note as unknown as RenderObjectInterface];
  }

  // Create onset animation render objects
  createOnsetAnimation(
    _block: NoteBlock,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    animationType: AnimationType,
    progress: number
  ): RenderObjectInterface[] {
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
  createOffsetAnimation(
    _block: NoteBlock,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    animationType: AnimationType,
    progress: number
  ): RenderObjectInterface[] {
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
  private _createFadeOnset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
    const note = new Rectangle(x, y, width, height, color);
    (note as any).globalAlpha = 0.8 * progress;
    return [note as unknown as RenderObjectInterface];
  }

  // Fade offset animation
  private _createFadeOffset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
    const note = new Rectangle(x, y, width, height, color);
    (note as any).globalAlpha = 0.8 * (1 - progress);
    return [note as unknown as RenderObjectInterface];
  }

  // Expand onset animation (grows from left to right)
  private _createExpandOnset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
    const expandedWidth = width * progress;
    const note = new Rectangle(x, y, Math.max(1, expandedWidth), height, color);
    (note as any).globalAlpha = 0.8;
    return [note as unknown as RenderObjectInterface];
  }

  // Expand offset animation (contracts from right to left)
  private _createExpandOffset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
    const remainingWidth = width * (1 - progress);
    const note = new Rectangle(x, y, Math.max(1, remainingWidth), height, color);
    (note as any).globalAlpha = 0.8;
    return [note as unknown as RenderObjectInterface];
  }

  // Scale onset animation (scales from center)
  private _createScaleOnset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
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
    (note as any).globalAlpha = 0.8;
    return [note as unknown as RenderObjectInterface];
  }

  // Scale offset animation (scales down to center)
  private _createScaleOffset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
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
    (note as any).globalAlpha = 0.8;
    return [note as unknown as RenderObjectInterface];
  }

  // Slide onset animation (slides in from left)
  private _createSlideOnset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
    const slideOffset = width * (1 - progress);
    const note = new Rectangle(x - slideOffset, y, width, height, color);
    (note as any).globalAlpha = 0.8 * progress;
    return [note as unknown as RenderObjectInterface];
  }

  // Slide offset animation (slides out to right)
  private _createSlideOffset(x: number, y: number, width: number, height: number, color: string, progress: number): RenderObjectInterface[] {
    const slideOffset = width * progress;
    const note = new Rectangle(x + slideOffset, y, width, height, color);
    (note as any).globalAlpha = 0.8 * (1 - progress);
    return [note as unknown as RenderObjectInterface];
  }

  // Create multiple animation variants for complex effects
  createComplexAnimation(
    block: NoteBlock,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    animationType: AnimationType,
    progress: number,
    animationPhase: 'onset' | 'offset' | 'sustained'
  ): RenderObjectInterface[] {
    const baseObjects = this.createOnsetAnimation(block, x, y, width, height, color, animationType, progress);

    // Add additional effects based on animation phase
    if (animationPhase === 'peak' as any && progress > 0.8) {
      const highlight = new Rectangle(x, y, width, height, this._brightenColor(color));
      (highlight as any).globalAlpha = 0.3 * (progress - 0.8) / 0.2;
      baseObjects.push(highlight as unknown as RenderObjectInterface);
    }

    return baseObjects;
  }

  // Utility methods
  private _brightenColor(color: string): string {
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

  _calculateAnimationTiming(startTime: number, endTime: number, currentTime: number, _duration: number) {
    // Helper for complex timing calculations
    const noteLifetime = endTime - startTime;
    const currentPosition = (currentTime - startTime) / noteLifetime;

    return {
      lifetime: noteLifetime,
      position: Math.max(0, Math.min(1, currentPosition)),
      phase: currentPosition < 0.1 ? 'onset' : currentPosition > 0.9 ? 'offset' : 'sustained',
    } as const;
  }

  // Animation factory method for easy creation
  static createAnimation(
    type: 'onset' | 'offset' | 'sustained' | 'static',
    animationType: AnimationType,
    progress: number,
    block: NoteBlock,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ): RenderObjectInterface[] {
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
