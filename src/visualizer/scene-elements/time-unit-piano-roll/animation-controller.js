// AnimationController - handles animation states and processing of notes into render objects
// Compatible with the property binding system used in TimeUnitPianoRollElement
import { NoteAnimations } from './note-animations.js';
import { debugLog } from '../../utils/debug-log.js';

export class AnimationController {
    constructor(timeUnitPianoRoll) {
        this.timeUnitPianoRoll = timeUnitPianoRoll;
        this.noteAnimations = new NoteAnimations();
    }

    buildNoteRenderObjects(config, noteBlocks, targetTime) {

        // Get animation settings from bound element
        const animationType = this.timeUnitPianoRoll.getProperty('animationType');
        const animationSpeed = this.timeUnitPianoRoll.getProperty('animationSpeed');
        const animationDuration = this.timeUnitPianoRoll.getProperty('animationDuration') || 0.5;
        const animationEnabled = animationType !== 'none';

        // Extract config values
        const { noteHeight, minNote, maxNote, pianoWidth, rollWidth } = config;
        const noteRange = { min: minNote, max: maxNote };
        const totalNotes = maxNote - minNote + 1;

        // Calculate time window using the element's time unit settings
        const win = this.timeUnitPianoRoll.midiManager.timingManager.getTimeUnitWindow(targetTime, this.timeUnitPianoRoll.getTimeUnitBars());
        const windowStart = win.start;
        const windowEnd = win.end;
        const timeUnitInSeconds = Math.max(1e-9, windowEnd - windowStart);
        const renderObjects = [];

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

            // Calculate timing
            // Geometry clamped to CURRENT window, with special case:
            // If we're in offset phase for a block whose window ended exactly at this window's start,
            // draw a short stub into the new window so the offset is visible after the unit ends.
            let drawStart = Math.max(block.startTime, windowStart);
            let drawEnd = Math.min(block.endTime, windowEnd);

            // Special offset carry-over rendering
            if (visState.type === 'offset' && block.windowEnd === windowStart) {
                // Render a small stub whose width follows the remaining offset progress
                const stubDuration = Math.max(0.01, this.timeUnitPianoRoll.getProperty('animationDuration') || 0.5);
                drawStart = windowStart; // start at window left edge
                drawEnd = Math.min(windowEnd, windowStart + stubDuration);
            }

            const startTimeInWindow = drawStart - windowStart;
            const endTimeInWindow = drawEnd - windowStart;
            const x = pianoWidth + (startTimeInWindow / timeUnitInSeconds) * rollWidth;
            const width = Math.max(2, ((endTimeInWindow - startTimeInWindow) / timeUnitInSeconds) * rollWidth);


            // Create note render objects using animation system
            const noteRenderObjects = this._createAnimatedNoteRenderObjects(
                { block, x, y, width, height: noteHeight, color: finalNoteColor, currentTime: targetTime, visState },
                animationType, animationSpeed, animationDuration, animationEnabled
            );

            renderObjects.push(...noteRenderObjects);
        }

        return renderObjects;
    }

    _createAnimatedNoteRenderObjects(args, animationType, animationSpeed, animationDuration, animationEnabled) {
        const { block, x, y, width, height, color, currentTime, visState } = args;
        debugLog(`[_createAnimatedNoteRenderObjects] Creating render objects for note ${block.note}:`, {
            x, y, width, height, color, currentTime, animationType, animationEnabled
        });

        if (!animationEnabled || animationType === 'none') {
            // No animation - create simple render object
            const staticObjects = this.noteAnimations.createStaticNote(block, x, y, width, height, color);
            debugLog(`[_createAnimatedNoteRenderObjects] Created ${staticObjects.length} static render objects`);
            return staticObjects;
        }

        // Use derived visual lifecycle state
        const animationState = visState;
        debugLog(`[_createAnimatedNoteRenderObjects] Animation state:`, animationState);
        if (!animationState) return [];

        // Create animated render objects based on state
        switch (animationState.type) {
            case 'onset':
                const onsetObjects = this.noteAnimations.createOnsetAnimation(
                    block, x, y, width, height, color,
                    animationType, animationState.progress
                );
                debugLog(`[_createAnimatedNoteRenderObjects] Created ${onsetObjects.length} onset animation objects`);
                return onsetObjects;
            case 'sustained':
                const sustainedObjects = this.noteAnimations.createSustainedNote(
                    block, x, y, width, height, color
                );
                debugLog(`[_createAnimatedNoteRenderObjects] Created ${sustainedObjects.length} sustained note objects`);
                return sustainedObjects;
            case 'offset':
                const offsetObjects = this.noteAnimations.createOffsetAnimation(
                    block, x, y, width, height, color,
                    animationType, animationState.progress
                );
                debugLog(`[_createAnimatedNoteRenderObjects] Created ${offsetObjects.length} offset animation objects`);
                return offsetObjects;
            default:
                debugLog(`[_createAnimatedNoteRenderObjects] Unknown animation state type: ${animationState.type}`);
                return [];
        }
    }

    _deriveVisualState(block, currentTime, animationDuration) {
        // Stateless lifecycle based on time-unit window
        const winStart = block.windowStart ?? (this.timeUnitPianoRoll.midiManager.timingManager.getTimeUnitWindow(currentTime, this.timeUnitPianoRoll.getTimeUnitBars()).start);
        const winEnd = block.windowEnd ?? (this.timeUnitPianoRoll.midiManager.timingManager.getTimeUnitWindow(currentTime, this.timeUnitPianoRoll.getTimeUnitBars()).end);

        const origStart = block.originalStartTime ?? block.startTime;

        // Onset should begin at max(origStart, winStart) for segments crossing into this unit
        const onsetStart = Math.max(origStart, winStart);
        const onsetEnd = onsetStart + Math.max(0.01, animationDuration);

        // Visibility holds until winEnd regardless of origEnd
        const visibleUntil = winEnd;

        // Start offset AFTER the time unit ends; this plays into the next window
        const offsetStart = visibleUntil;
        const offsetEnd = offsetStart + Math.max(0.01, animationDuration);

        if (currentTime >= onsetStart && currentTime < onsetEnd) {
            return { type: 'onset', progress: (currentTime - onsetStart) / (onsetEnd - onsetStart), startTime: onsetStart, endTime: onsetEnd };
        }
        if (currentTime >= onsetEnd && currentTime < offsetStart) {
            return { type: 'sustained', progress: 1, startTime: null, endTime: null };
        }
        if (currentTime >= offsetStart && currentTime < offsetEnd) {
            return { type: 'offset', progress: (currentTime - offsetStart) / (offsetEnd - offsetStart), startTime: offsetStart, endTime: offsetEnd };
        }
        return null;
    }

    // Validate animation configuration to prevent timing bugs
    validateAnimationConfig() {
        const issues = [];

        const animationType = this.timeUnitPianoRoll.getProperty('animationType');
        const animationSpeed = this.timeUnitPianoRoll.getProperty('animationSpeed');
        const animationDuration = this.timeUnitPianoRoll.getProperty('animationDuration') || 0.5;
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

    // Public methods for controlling animations (these now work through property bindings)
    setAnimationType(type) {
        // In the bound version, we don't directly set properties
        // This would be handled through the property binding system
        console.warn('setAnimationType should be handled through property bindings in BoundAnimationController');
        return this;
    }

    setAnimationSpeed(speed) {
        // In the bound version, we don't directly set properties
        // This would be handled through the property binding system
        console.warn('setAnimationSpeed should be handled through property bindings in BoundAnimationController');
        return this;
    }

    setAnimationDuration(duration) {
        // In the bound version, we don't directly set properties
        // This would be handled through the property binding system
        console.warn('setAnimationDuration should be handled through property bindings in BoundAnimationController');
        return this;
    }

    setAnimationEnabled(enabled) {
        // In the bound version, we don't directly set properties
        // This would be handled through the property binding system
        console.warn('setAnimationEnabled should be handled through property bindings in BoundAnimationController');
        return this;
    }

    getAnimationState() {
        const animationType = this.timeUnitPianoRoll.getProperty('animationType');
        const animationSpeed = this.timeUnitPianoRoll.getProperty('animationSpeed');
        const animationDuration = this.timeUnitPianoRoll.getProperty('animationDuration') || 0.5;
        const animationEnabled = animationType !== 'none';

        return {
            type: animationType,
            speed: animationSpeed,
            duration: animationDuration,
            enabled: animationEnabled
        };
    }
}
