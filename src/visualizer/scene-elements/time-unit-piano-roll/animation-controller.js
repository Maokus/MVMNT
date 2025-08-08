// AnimationController - handles animation states and processing of notes into render objects
// Compatible with the property binding system used in TimeUnitPianoRollElement
import { NoteAnimations } from './note-animations.js';

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
        const timeUnitInSeconds = this.timeUnitPianoRoll.getTimeUnit();
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
            const channelColors = this.timeUnitPianoRoll.getChannelColors();
            const finalNoteColor = channelColors[block.channel % channelColors.length];

            // Calculate timing
            const noteStartTime = block.startTime;
            const noteEndTime = block.endTime;
            const startTimeInWindow = noteStartTime - windowStart;
            const endTimeInWindow = noteEndTime - windowStart;

            const x = pianoWidth + (startTimeInWindow / timeUnitInSeconds) * rollWidth;
            const width = Math.max(2, ((endTimeInWindow - startTimeInWindow) / timeUnitInSeconds) * rollWidth);


            // Create note render objects using animation system
            const noteRenderObjects = this._createAnimatedNoteRenderObjects(
                block, x, y, width, noteHeight, finalNoteColor, targetTime,
                animationType, animationSpeed, animationDuration, animationEnabled
            );

            renderObjects.push(...noteRenderObjects);
        }

        return renderObjects;
    }

    _createAnimatedNoteRenderObjects(block, x, y, width, height, color, currentTime, animationType, animationSpeed, animationDuration, animationEnabled) {
        console.log(`[_createAnimatedNoteRenderObjects] Creating render objects for note ${block.note}:`, {
            x, y, width, height, color, currentTime, animationType, animationEnabled
        });

        if (!animationEnabled || animationType === 'none') {
            // No animation - create simple render object
            const staticObjects = this.noteAnimations.createStaticNote(block, x, y, width, height, color);
            console.log(`[_createAnimatedNoteRenderObjects] Created ${staticObjects.length} static render objects`);
            return staticObjects;
        }

        // Get animation state for this note
        const animationState = this._calculateAnimationState(block, currentTime, animationDuration);

        console.log(`[_createAnimatedNoteRenderObjects] Animation state:`, animationState);

        if (!animationState) {
            console.log(`[_createAnimatedNoteRenderObjects] No animation state - note not visible`);
            return []; // Note not visible
        }

        // Create animated render objects based on state
        switch (animationState.type) {
            case 'onset':
                const onsetObjects = this.noteAnimations.createOnsetAnimation(
                    block, x, y, width, height, color,
                    animationType, animationState.progress
                );
                console.log(`[_createAnimatedNoteRenderObjects] Created ${onsetObjects.length} onset animation objects`);
                return onsetObjects;
            case 'sustained':
                const sustainedObjects = this.noteAnimations.createSustainedNote(
                    block, x, y, width, height, color
                );
                console.log(`[_createAnimatedNoteRenderObjects] Created ${sustainedObjects.length} sustained note objects`);
                return sustainedObjects;
            case 'offset':
                const offsetObjects = this.noteAnimations.createOffsetAnimation(
                    block, x, y, width, height, color,
                    animationType, animationState.progress
                );
                console.log(`[_createAnimatedNoteRenderObjects] Created ${offsetObjects.length} offset animation objects`);
                return offsetObjects;
            default:
                console.log(`[_createAnimatedNoteRenderObjects] Unknown animation state type: ${animationState.type}`);
                return [];
        }
    }

    _calculateAnimationState(block, currentTime, animationDuration) {
        // Use original timing for animations if available (for split notes)
        const noteStartTime = block.originalStartTime || block.startTime;
        const noteEndTime = block.originalEndTime || block.endTime;

        console.log(`[_calculateAnimationState] Note ${block.note}: startTime=${noteStartTime}, endTime=${noteEndTime}, currentTime=${currentTime}, duration=${animationDuration}`);

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

        console.log(`[_calculateAnimationState] Animation windows: onset(${onsetAnimationStart}-${onsetAnimationEnd}), sustained(${onsetAnimationEnd}-${offsetAnimationStart}), offset(${offsetAnimationStart}-${offsetAnimationEnd})`);

        // Check if we're within the onset animation window
        if (currentTime >= onsetAnimationStart && currentTime <= onsetAnimationEnd) {
            const state = {
                type: 'onset',
                progress: (currentTime - onsetAnimationStart) / animationDuration,
                startTime: onsetAnimationStart,
                endTime: onsetAnimationEnd
            };
            console.log(`[_calculateAnimationState] Note ${block.note} in ONSET state:`, state);
            return state;
        }

        // Check if we're within the offset animation window
        if (currentTime >= offsetAnimationStart && currentTime <= offsetAnimationEnd) {
            const state = {
                type: 'offset',
                progress: (currentTime - offsetAnimationStart) / animationDuration,
                startTime: offsetAnimationStart,
                endTime: offsetAnimationEnd
            };
            console.log(`[_calculateAnimationState] Note ${block.note} in OFFSET state:`, state);
            return state;
        }

        // If we're between onset and offset animations, show sustained note
        if (currentTime > onsetAnimationEnd && currentTime < offsetAnimationStart) {
            const state = {
                type: 'sustained',
                progress: 1,
                startTime: null,
                endTime: null
            };
            console.log(`[_calculateAnimationState] Note ${block.note} in SUSTAINED state:`, state);
            return state;
        }

        // Note not visible or no animation needed
        console.log(`[_calculateAnimationState] Note ${block.note} NOT VISIBLE - currentTime ${currentTime} outside note duration`);
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
