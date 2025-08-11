// AnimationController - handles animation states and processing of notes into render objects
// Compatible with the property binding system used in TimeUnitPianoRollElement
import { createAnimationInstance, type AnimationPhase } from './note-animations/index';
import { debugLog } from '../../utils/debug-log.js';
import type { RenderObjectInterface } from '../../types.js';
import type { TimeUnitPianoRollElement } from './time-unit-piano-roll';
import type { NoteBlock as TNoteBlock } from './note-block';

export type AnimationType = 'fade' | 'slide' | 'scale' | 'expand' | 'debug' | 'none';

export interface BuildConfig {
  noteHeight: number;
  minNote: number;
  maxNote: number;
  pianoWidth: number;
  rollWidth: number;
}

export interface VisualState {
  type: AnimationPhase;
  progress: number;
  startTime: number | null;
  endTime: number | null;
}

export class AnimationController {
  private timeUnitPianoRoll: TimeUnitPianoRollElement;
  // Cache instance per type to avoid recreating per note
  private _animationCache: Map<AnimationType, ReturnType<typeof createAnimationInstance>> = new Map();

  constructor(timeUnitPianoRoll: TimeUnitPianoRollElement) {
  this.timeUnitPianoRoll = timeUnitPianoRoll;
  }

  buildNoteRenderObjects(
    config: BuildConfig,
    noteBlocks: TNoteBlock[],
    targetTime: number
  ): RenderObjectInterface[] {
    // Get animation settings from bound element
  const animationType = this.timeUnitPianoRoll.getAnimationType() as AnimationType;
  const animationSpeed = this.timeUnitPianoRoll.getAnimationSpeed();
  const animationDuration = this.timeUnitPianoRoll.getAnimationDuration() || 0.5;
    const animationEnabled = animationType !== 'none';

    // Extract config values
    const { noteHeight, minNote, maxNote, pianoWidth, rollWidth } = config;
    const noteRange = { min: minNote, max: maxNote };
    const totalNotes = maxNote - minNote + 1;

    // Calculate time window using the element's time unit settings
    const win = this.timeUnitPianoRoll.midiManager.timingManager.getTimeUnitWindow(
      targetTime,
      this.timeUnitPianoRoll.getTimeUnitBars()
    );
    const windowStart = win.start;
    const windowEnd = win.end;
    const timeUnitInSeconds = Math.max(1e-9, windowEnd - windowStart);
    const renderObjects: RenderObjectInterface[] = [];

    if (!noteBlocks || noteBlocks.length === 0) {
      return renderObjects;
    }

    for (const block of noteBlocks) {
      // Derive visual lifecycle state statelessly
      const visState = this._deriveVisualState(block, targetTime, animationDuration);
      if (!visState) continue;

      const noteIndex = block.note - noteRange.min;
      if (noteIndex < 0 || noteIndex >= totalNotes) {
        continue;
      }

      const y = (totalNotes - noteIndex - 1) * noteHeight;
      const channelColors = this.timeUnitPianoRoll.getChannelColors();
      const finalNoteColor = channelColors[block.channel % channelColors.length];

      // Calculate timing and geometry
      // Default: clamp to CURRENT window
      let drawStart = Math.max(block.startTime, windowStart);
      let drawEnd = Math.min(block.endTime, windowEnd);

      let relWindowStart = windowStart;
      let relWindowEnd = windowEnd;
      let relWindowDuration = timeUnitInSeconds;

      // If we're in OFFSET phase immediately after a rollover, preserve the previous window's geometry
      const EPS = 1e-9;
      if (
        visState.type === 'offset' &&
        block.windowEnd != null &&
        Math.abs(block.windowEnd - windowStart) < EPS
      ) {
        // Use the block's own window as the reference frame (the previous window)
        relWindowStart = block.windowStart ?? windowStart;
        relWindowEnd = block.windowEnd ?? windowEnd;
        relWindowDuration = Math.max(1e-9, relWindowEnd - relWindowStart);

        drawStart = Math.max(block.startTime, relWindowStart);
        drawEnd = Math.min(block.endTime, relWindowEnd);
      } else if (visState.type === 'preOnset' && block.windowStart != null) {
        // For preOnset of a note in the NEXT window, use the note's own window
        relWindowStart = block.windowStart;
        relWindowEnd = block.windowEnd ?? (block.windowStart + timeUnitInSeconds);
        relWindowDuration = Math.max(1e-9, relWindowEnd - relWindowStart);

        drawStart = Math.max(block.startTime, relWindowStart);
        drawEnd = Math.min(block.endTime, relWindowEnd);
      }

      const startTimeInWindow = drawStart - relWindowStart;
      const endTimeInWindow = drawEnd - relWindowStart;
      const x = pianoWidth + (startTimeInWindow / relWindowDuration) * rollWidth;
      const width = Math.max(2, ((endTimeInWindow - startTimeInWindow) / relWindowDuration) * rollWidth);

      // Create note render objects using animation system
  const noteRenderObjects = this._createAnimatedNoteRenderObjects(
        { block, x, y, width, height: noteHeight, color: finalNoteColor, currentTime: targetTime, visState },
        animationType,
        animationSpeed,
        animationDuration,
        animationEnabled
      );

      renderObjects.push(...noteRenderObjects);
    }

    return renderObjects;
  }

  private _createAnimatedNoteRenderObjects(
    args: {
      block: TNoteBlock;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      currentTime: number;
      visState: VisualState;
    },
    animationType: AnimationType,
    animationSpeed: number,
    animationDuration: number,
    animationEnabled: boolean
  ): RenderObjectInterface[] {
  const { block, x, y, width, height, color, currentTime, visState } = args;
    debugLog(`[_createAnimatedNoteRenderObjects] Creating render objects for note ${block.note}:`, {
      x,
      y,
      width,
      height,
      color,
      currentTime,
      animationType,
      animationEnabled,
    });

    if (!animationEnabled || animationType === 'none') {
      // No animation - draw sustained/static rectangle
      const inst = this._getAnimationInstance('expand'); // use expand for neutral draw
      return inst.render({ block, x, y, width, height, color, progress: 1, phase: 'sustained' });
    }

    // Use derived visual lifecycle state
    const animationState = visState;
    debugLog(`[_createAnimatedNoteRenderObjects] Animation state:`, animationState);
    if (!animationState) return [];

    const inst = this._getAnimationInstance(animationType);
    const phase = animationState.type as AnimationPhase;
    const p = Math.max(0, Math.min(1, animationState.progress));
    return inst.render({ block, x, y, width, height, color, progress: p, phase });
  }

  private _getAnimationInstance(type: AnimationType) {
    let inst = this._animationCache.get(type);
    if (!inst) {
      inst = createAnimationInstance(type);
      this._animationCache.set(type, inst);
    }
    return inst;
  }

  private _deriveVisualState(
    block: TNoteBlock,
    currentTime: number,
    animationDuration: number
  ): VisualState | null {
    // Robust lifecycle based on time-unit window, with preOnset and overlap guards
    const win = this.timeUnitPianoRoll.midiManager.timingManager.getTimeUnitWindow(
      currentTime,
      this.timeUnitPianoRoll.getTimeUnitBars()
    );
    const winStart = block.windowStart ?? win.start;
    const winEnd = block.windowEnd ?? win.end;

    const origStart = block.originalStartTime ?? block.startTime;
    const origEnd = block.originalEndTime ?? block.endTime;

    const EPS = 1e-6;
    const dur = Math.max(0.01, animationDuration);

    // Pre-onset starts one duration before onsetStart
    const onsetStart = Math.max(origStart, winStart);
    const preOnsetStart = onsetStart - dur;
    const preOnsetEnd = onsetStart; // exclusive upper bound
    const onsetEnd = onsetStart + dur;

    // Visible until the end of this window or the note end (whichever is earlier)
    const visibleUntil = Math.min(winEnd, Math.max(onsetEnd, origEnd));

    // Offset plays after visibility ends, but we clamp so that offset never starts before onset ends
    let offsetStart = Math.max(visibleUntil, onsetEnd);
    let offsetEnd = offsetStart + dur;

    // Guard against overlap when window is smaller than 2*dur
    if (offsetStart - onsetEnd < EPS) {
      offsetStart = onsetEnd + EPS;
      offsetEnd = offsetStart + dur;
    }

    if (currentTime >= preOnsetStart && currentTime < preOnsetEnd) {
      return {
        type: 'preOnset',
        progress: (currentTime - preOnsetStart) / (preOnsetEnd - preOnsetStart),
        startTime: preOnsetStart,
        endTime: preOnsetEnd,
      };
    }
    if (currentTime >= onsetStart && currentTime < onsetEnd) {
      return {
        type: 'onset',
        progress: (currentTime - onsetStart) / (onsetEnd - onsetStart),
        startTime: onsetStart,
        endTime: onsetEnd,
      };
    }
    if (currentTime >= onsetEnd && currentTime < offsetStart) {
      return { type: 'sustained', progress: 1, startTime: null, endTime: null };
    }
    if (currentTime >= offsetStart && currentTime < offsetEnd) {
      return {
        type: 'offset',
        progress: (currentTime - offsetStart) / (offsetEnd - offsetStart),
        startTime: offsetStart,
        endTime: offsetEnd,
      };
    }
    return null;
  }

  // Validate animation configuration to prevent timing bugs
  validateAnimationConfig(): string[] {
    const issues: string[] = [];

  const animationType = this.timeUnitPianoRoll.getAnimationType() as AnimationType;
  const animationSpeed = this.timeUnitPianoRoll.getAnimationSpeed();
  const animationDuration = this.timeUnitPianoRoll.getAnimationDuration() || 0.5;
    const animationEnabled = animationType !== 'none';

    if (animationEnabled) {
      if (!animationDuration || animationDuration <= 0) {
        issues.push('Invalid animation duration');
      }

      if (animationDuration > this.timeUnitPianoRoll.getTimeUnit()) {
        issues.push('Animation duration longer than time unit');
      }

      if (animationSpeed <= 0) {
        issues.push('Invalid animation speed');
      }
    }

    return issues;
  }

  // Public methods for controlling animations (no-ops in binding system)
  setAnimationType(_type: AnimationType): this {
    console.warn('setAnimationType should be handled through property bindings in BoundAnimationController');
    return this;
  }

  setAnimationSpeed(_speed: number): this {
    console.warn('setAnimationSpeed should be handled through property bindings in BoundAnimationController');
    return this;
  }

  setAnimationDuration(_duration: number): this {
    console.warn('setAnimationDuration should be handled through property bindings in BoundAnimationController');
    return this;
  }

  setAnimationEnabled(_enabled: boolean): this {
    console.warn('setAnimationEnabled should be handled through property bindings in BoundAnimationController');
    return this;
  }

  getAnimationState() {
  const animationType = this.timeUnitPianoRoll.getAnimationType();
  const animationSpeed = this.timeUnitPianoRoll.getAnimationSpeed();
  const animationDuration = this.timeUnitPianoRoll.getAnimationDuration() || 0.5;
    const animationEnabled = animationType !== 'none';

    return {
      type: animationType,
      speed: animationSpeed,
      duration: animationDuration,
      enabled: animationEnabled,
    };
  }
}
