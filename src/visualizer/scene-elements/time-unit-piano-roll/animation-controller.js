// AnimationController - handles animation states and processing of notes into render objects
import { NoteAnimations } from './note-animations.js';

export class AnimationController {
    constructor(timeUnitPianoRoll) {
        this.timeUnitPianoRoll = timeUnitPianoRoll;
        this.noteAnimations = new NoteAnimations();

        // Animation settings (synced with parent element)
        this.animationType = 'fade';
        this.animationSpeed = 1.0;
        this.animationDuration = 0.5;
        this.animationEnabled = true;
    }

    updateSettings(timeUnitPianoRoll) {
        this.animationType = timeUnitPianoRoll.animationType;
        this.animationSpeed = timeUnitPianoRoll.animationSpeed;
        this.animationDuration = timeUnitPianoRoll.animationDuration;
        this.animationEnabled = this.animationType !== 'none';
    }

    buildNoteRenderObjects(config, noteRange, totalNotes, noteHeight) {
        const { noteBlocks, targetTime } = config;

        // Calculate time window using the element's time unit settings
        const timeUnitInSeconds = this.timeUnitPianoRoll.getTimeUnit();
        const windowStart = Math.floor(targetTime / timeUnitInSeconds) * timeUnitInSeconds;
        const windowEnd = windowStart + timeUnitInSeconds;
        const renderObjects = [];

        if (!noteBlocks || noteBlocks.length === 0) {
            console.log('No note blocks available for rendering');
            return renderObjects;
        }

        console.log(`Building notes: ${noteBlocks.length} note blocks, target time: ${targetTime}`);

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
            const noteColor = this.timeUnitPianoRoll.channelColors[block.channel % this.timeUnitPianoRoll.channelColors.length];

            // Calculate timing
            const noteStartTime = block.startTime;
            const noteEndTime = block.endTime;
            const startTimeInWindow = noteStartTime - windowStart;
            const endTimeInWindow = noteEndTime - windowStart;

            const x = config.pianoWidth + (startTimeInWindow / timeUnitInSeconds) * config.rollWidth;
            const width = Math.max(2, ((endTimeInWindow - startTimeInWindow) / timeUnitInSeconds) * config.rollWidth);

            // Create note render objects using animation system
            const noteRenderObjects = this._createAnimatedNoteRenderObjects(
                block, x, y, width, noteHeight, noteColor, targetTime
            );

            renderObjects.push(...noteRenderObjects);
        }

        console.log(`Generated ${renderObjects.length} note render objects`);
        return renderObjects;
    }

    _createAnimatedNoteRenderObjects(block, x, y, width, height, color, currentTime) {
        if (!this.animationEnabled || this.animationType === 'none') {
            // No animation - create simple render object
            return this.noteAnimations.createStaticNote(block, x, y, width, height, color);
        }

        // Get animation state for this note
        const animationState = this._calculateAnimationState(block, currentTime);

        if (!animationState) {
            return []; // Note not visible
        }

        // Create animated render objects based on state
        switch (animationState.type) {
            case 'onset':
                return this.noteAnimations.createOnsetAnimation(
                    block, x, y, width, height, color,
                    this.animationType, animationState.progress
                );
            case 'sustained':
                return this.noteAnimations.createSustainedNote(
                    block, x, y, width, height, color
                );
            case 'offset':
                return this.noteAnimations.createOffsetAnimation(
                    block, x, y, width, height, color,
                    this.animationType, animationState.progress
                );
            default:
                return [];
        }
    }

    _calculateAnimationState(block, currentTime) {
        // Use original timing for animations if available (for split notes)
        const noteStartTime = block.originalStartTime || block.startTime;
        const noteEndTime = block.originalEndTime || block.endTime;

        // Determine animation duration based on configuration
        let animationDuration = this.animationDuration;
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

        if (this.animationEnabled) {
            if (!this.animationDuration || this.animationDuration <= 0) {
                issues.push('Invalid animation duration');
            }

            if (this.animationDuration > this.timeUnitPianoRoll.timeUnit) {
                issues.push('Animation duration longer than time unit');
            }

            if (this.animationSpeed <= 0) {
                issues.push('Invalid animation speed');
            }
        }

        return issues;
    }

    // Public methods for controlling animations
    setAnimationType(type) {
        this.animationType = type;
        this.animationEnabled = type !== 'none';
        return this;
    }

    setAnimationSpeed(speed) {
        this.animationSpeed = Math.max(0.1, Math.min(5.0, speed));
        return this;
    }

    setAnimationDuration(duration) {
        this.animationDuration = Math.max(0.01, duration);
        return this;
    }

    setAnimationEnabled(enabled) {
        this.animationEnabled = enabled;
        return this;
    }

    getAnimationState() {
        return {
            type: this.animationType,
            speed: this.animationSpeed,
            duration: this.animationDuration,
            enabled: this.animationEnabled
        };
    }
}
