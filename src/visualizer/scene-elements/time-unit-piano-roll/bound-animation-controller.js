// BoundAnimationController - handles animation states and processing of notes into render objects
// Compatible with the property binding system used in BoundTimeUnitPianoRollElement
import { NoteAnimations } from './note-animations.js';

export class BoundAnimationController {
    constructor(boundTimeUnitPianoRoll) {
        this.boundTimeUnitPianoRoll = boundTimeUnitPianoRoll;
        this.noteAnimations = new NoteAnimations();
    }

    buildNoteRenderObjects(config, noteRange, totalNotes, noteHeight) {
        const { noteBlocks, targetTime } = config;

        // Get animation settings from bound element
        const animationType = this.boundTimeUnitPianoRoll.getProperty('animationType');
        const animationSpeed = this.boundTimeUnitPianoRoll.getProperty('animationSpeed');
        const animationDuration = this.boundTimeUnitPianoRoll.getProperty('animationDuration') || 0.5;
        const animationEnabled = animationType !== 'none';

        // Calculate time window using the element's time unit settings
        const timeUnitInSeconds = this.boundTimeUnitPianoRoll.getTimeUnit();
        const windowStart = Math.floor(targetTime / timeUnitInSeconds) * timeUnitInSeconds;
        const windowEnd = windowStart + timeUnitInSeconds;
        const renderObjects = [];

        if (!noteBlocks || noteBlocks.length === 0) {
            return renderObjects;
        }

        for (const block of noteBlocks) {
            // Check if note should be shown in current time window
            const shouldShow = block.shouldShow(targetTime, windowStart, windowEnd);

            if (!shouldShow) {
                continue;
            }

            const noteIndex = block.note - noteRange.min;
            if (noteIndex < 0 || noteIndex >= totalNotes) {
                continue;
            }

            const y = (totalNotes - noteIndex - 1) * noteHeight;
            const channelColors = this.boundTimeUnitPianoRoll.getChannelColors();
            const noteColor = channelColors[block.channel % channelColors.length];

            // Calculate timing
            const noteStartTime = block.startTime;
            const noteEndTime = block.endTime;
            const startTimeInWindow = noteStartTime - windowStart;
            const endTimeInWindow = noteEndTime - windowStart;

            const x = config.pianoWidth + (startTimeInWindow / timeUnitInSeconds) * config.rollWidth;
            const width = Math.max(2, ((endTimeInWindow - startTimeInWindow) / timeUnitInSeconds) * config.rollWidth);

            // Create note render objects using animation system
            const noteRenderObjects = this._createAnimatedNoteRenderObjects(
                block, x, y, width, noteHeight, noteColor, targetTime, 
                animationType, animationSpeed, animationDuration, animationEnabled
            );

            renderObjects.push(...noteRenderObjects);
        }

        return renderObjects;
    }

    _createAnimatedNoteRenderObjects(block, x, y, width, height, color, currentTime, animationType, animationSpeed, animationDuration, animationEnabled) {
        if (!animationEnabled || animationType === 'none') {
            // No animation - create simple render object
            return this.noteAnimations.createStaticNote(block, x, y, width, height, color);
        }

        // Get animation state for this note
        const animationState = this._calculateAnimationState(block, currentTime, animationDuration);

        if (!animationState) {
            return []; // Note not visible
        }

        // Create animated render objects based on state
        switch (animationState.type) {
            case 'onset':
                return this.noteAnimations.createOnsetAnimation(
                    block, x, y, width, height, color,
                    animationType, animationState.progress
                );
            case 'sustained':
                return this.noteAnimations.createSustainedNote(
                    block, x, y, width, height, color
                );
            case 'offset':
                return this.noteAnimations.createOffsetAnimation(
                    block, x, y, width, height, color,
                    animationType, animationState.progress
                );
            default:
                return [];
        }
    }

    _calculateAnimationState(block, currentTime, animationDuration) {
        // Use original timing for animations if available (for split notes)
        const noteStartTime = block.originalStartTime || block.startTime;
        const noteEndTime = block.originalEndTime || block.endTime;

        // Determine animation duration based on configuration
        const noteDuration = noteEndTime - noteStartTime;
        animationDuration = Math.min(animationDuration, noteDuration * 0.3); // Max 30% of note duration

        // Ensure minimum animation duration to prevent division by zero
        animationDuration = Math.max(animationDuration, 0.01);

        // Note onset animation (when note starts playing)
        const onsetAnimationStart = noteStartTime;
        const onsetAnimationEnd = noteStartTime + animationDuration;

        // Note offset animation (when note stops playing)
        const offsetAnimationStart = noteEndTime - animationDuration;
        const offsetAnimationEnd = noteEndTime;

        // Check if we're within the onset animation window
        if (currentTime >= onsetAnimationStart && currentTime <= onsetAnimationEnd) {
            return {
                type: 'onset',
                progress: (currentTime - onsetAnimationStart) / animationDuration,
                startTime: onsetAnimationStart,
                endTime: onsetAnimationEnd
            };
        }

        // Check if we're within the offset animation window
        if (currentTime >= offsetAnimationStart && currentTime <= offsetAnimationEnd) {
            return {
                type: 'offset',
                progress: (currentTime - offsetAnimationStart) / animationDuration,
                startTime: offsetAnimationStart,
                endTime: offsetAnimationEnd
            };
        }

        // If we're between onset and offset animations, show sustained note
        if (currentTime > onsetAnimationEnd && currentTime < offsetAnimationStart) {
            return {
                type: 'sustained',
                progress: 1,
                startTime: null,
                endTime: null
            };
        }

        // Note not visible or no animation needed
        return null;
    }

    // Validate animation configuration to prevent timing bugs
    validateAnimationConfig() {
        const issues = [];
        
        const animationType = this.boundTimeUnitPianoRoll.getProperty('animationType');
        const animationSpeed = this.boundTimeUnitPianoRoll.getProperty('animationSpeed');
        const animationDuration = this.boundTimeUnitPianoRoll.getProperty('animationDuration') || 0.5;
        const animationEnabled = animationType !== 'none';

        if (animationEnabled) {
            if (!animationDuration || animationDuration <= 0) {
                issues.push('Invalid animation duration');
            }

            if (animationDuration > this.boundTimeUnitPianoRoll.getTimeUnit()) {
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
        const animationType = this.boundTimeUnitPianoRoll.getProperty('animationType');
        const animationSpeed = this.boundTimeUnitPianoRoll.getProperty('animationSpeed');
        const animationDuration = this.boundTimeUnitPianoRoll.getProperty('animationDuration') || 0.5;
        const animationEnabled = animationType !== 'none';

        return {
            type: animationType,
            speed: animationSpeed,
            duration: animationDuration,
            enabled: animationEnabled
        };
    }
}
