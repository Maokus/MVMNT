// AnimationController - handles animation states and processing of notes into render objects
// Compatible with the property binding system used in TimeUnitPianoRollElement
import { createAnimationInstance, type AnimationPhase } from './note-animations/index';
import { debugLog } from '../../utils/debug-log.js';
import type { RenderObjectInterface } from '../../types.js';
import type { TimeUnitPianoRollElement } from './time-unit-piano-roll';
import type { NoteBlock as TNoteBlock } from './note-block';

export type AnimationType = string; // Open registry id ('none' handled specially)

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

    buildNoteRenderObjects(config: BuildConfig, noteBlocks: TNoteBlock[], targetTime: number): RenderObjectInterface[] {
        // Get animation settings from bound element
        const animationType = this.timeUnitPianoRoll.getAnimationType() as AnimationType;
        const attack = this.timeUnitPianoRoll.getAttackDuration();
        const decay = this.timeUnitPianoRoll.getDecayDuration();
        const release = this.timeUnitPianoRoll.getReleaseDuration();
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
            const visState = this._deriveVisualState(block, targetTime, { attack, decay, release });
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

            // If we're in RELEASE phase immediately after a rollover, preserve the previous window's geometry
            const EPS = 1e-9;
            if (
                visState.type === 'release' &&
                block.windowEnd != null &&
                Math.abs(block.windowEnd - windowStart) < EPS
            ) {
                // Use the block's own window as the reference frame (the previous window)
                relWindowStart = block.windowStart ?? windowStart;
                relWindowEnd = block.windowEnd ?? windowEnd;
                relWindowDuration = Math.max(1e-9, relWindowEnd - relWindowStart);

                drawStart = Math.max(block.startTime, relWindowStart);
                drawEnd = Math.min(block.endTime, relWindowEnd);
            } else if (visState.type === 'attack' && block.windowStart != null) {
                // For attack of a note in the NEXT window, use the note's own window
                relWindowStart = block.windowStart;
                relWindowEnd = block.windowEnd ?? block.windowStart + timeUnitInSeconds;
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
                {
                    block,
                    x,
                    y,
                    width,
                    height: noteHeight,
                    color: finalNoteColor,
                    currentTime: targetTime,
                    visState,
                },
                animationType,
                attack,
                decay,
                release,
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
        attack: number,
        decay: number,
        release: number,
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
            return inst.render({
                block,
                x,
                y,
                width,
                height,
                color,
                progress: 1,
                phase: 'sustain',
                currentTime,
            });
        }

        // Use derived visual lifecycle state
        const animationState = visState;
        debugLog(`[_createAnimatedNoteRenderObjects] Animation state:`, animationState);
        if (!animationState) return [];

        const inst = this._getAnimationInstance(animationType);
        const phase = animationState.type as AnimationPhase;
        const p = Math.max(0, Math.min(1, animationState.progress));
        return inst.render({
            block,
            x,
            y,
            width,
            height,
            color,
            progress: p,
            phase,
            currentTime,
        });
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
        phases: { attack: number; decay: number; release: number }
    ): VisualState | null {
        // Robust lifecycle based on time-unit window, with ADSR phases and overlap guards
        const win = this.timeUnitPianoRoll.midiManager.timingManager.getTimeUnitWindow(
            currentTime,
            this.timeUnitPianoRoll.getTimeUnitBars()
        );
        const winStart = block.windowStart ?? win.start;
        const winEnd = block.windowEnd ?? win.end;
        const winLength = win.end - win.start;
        const EPS = (1.0 * 10.0) ** -6.0;

        const origStart = block.originalStartTime ?? block.startTime;

        const attackDur = Math.min(Math.max(0, phases.attack), winLength);
        const decayDur = Math.min(Math.max(0, phases.decay), winLength);
        const releaseDur = Math.min(Math.max(0, phases.release), winLength);

        // Decay begins when note becomes visible in this window
        const decayStart = Math.max(origStart, winStart);
        const attackStart = decayStart - attackDur; // attack preview
        const attackEnd = decayStart - EPS; // exclusive
        const decayEnd = Math.min(decayStart + decayDur, winEnd);
        const releaseStart = winEnd + EPS; // release always begins at end of window
        const releaseEnd = releaseStart + releaseDur;

        if (currentTime >= attackStart && currentTime < attackEnd) {
            return {
                type: 'attack',
                progress: (currentTime - attackStart) / (attackEnd - attackStart),
                startTime: attackStart,
                endTime: attackEnd,
            };
        }
        if (currentTime >= decayStart && currentTime < decayEnd) {
            return {
                type: 'decay',
                progress: (currentTime - decayStart) / (decayEnd - decayStart),
                startTime: decayStart,
                endTime: decayEnd,
            };
        }
        if (currentTime >= decayEnd && currentTime < releaseStart) {
            // sustain between end of decay and start of release
            return {
                type: 'sustain',
                progress: 1,
                startTime: null,
                endTime: null,
            };
        }
        if (currentTime >= releaseStart && currentTime < releaseEnd) {
            return {
                type: 'release',
                progress: (currentTime - releaseStart) / (releaseEnd - releaseStart),
                startTime: releaseStart,
                endTime: releaseEnd,
            };
        }
        return null;
    }

    // Validate animation configuration to prevent timing bugs
    validateAnimationConfig(): string[] {
        const issues: string[] = [];

        const animationType = this.timeUnitPianoRoll.getAnimationType() as AnimationType;
        const enabled = animationType !== 'none';
        if (enabled) {
            const attack = this.timeUnitPianoRoll.getAttackDuration();
            const decay = this.timeUnitPianoRoll.getDecayDuration();
            const release = this.timeUnitPianoRoll.getReleaseDuration();
            const timeUnit = this.timeUnitPianoRoll.getTimeUnit();
            const clampWarn = (name: string, val: number) => {
                if (!isFinite(val) || val < 0) issues.push(`Invalid ${name} duration`);
                if (val > timeUnit * 10) issues.push(`${name} duration very large (${val.toFixed(2)}s)`);
            };
            clampWarn('attack', attack);
            clampWarn('decay', decay);
            clampWarn('release', release);
        }

        return issues;
    }

    // Public methods for controlling animations (no-ops in binding system)
    setAnimationType(_type: AnimationType): this {
        console.warn('setAnimationType should be handled through property bindings in BoundAnimationController');
        return this;
    }

    // Deprecated setters retained for backward compatibility logging
    setAnimationSpeed(_speed: number): this {
        return this;
    }
    setAnimationDuration(_duration: number): this {
        return this;
    }

    setAnimationEnabled(_enabled: boolean): this {
        console.warn('setAnimationEnabled should be handled through property bindings in BoundAnimationController');
        return this;
    }

    getAnimationState() {
        const animationType = this.timeUnitPianoRoll.getAnimationType();
        return {
            type: animationType,
            attack: this.timeUnitPianoRoll.getAttackDuration(),
            decay: this.timeUnitPianoRoll.getDecayDuration(),
            release: this.timeUnitPianoRoll.getReleaseDuration(),
            enabled: animationType !== 'none',
        };
    }
}
