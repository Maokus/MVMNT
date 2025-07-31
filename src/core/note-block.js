// NoteBlock class handles the rendering of individual notes
import { globalTimingManager } from './timing-manager.js';

export class NoteBlock {
    constructor(note, channel, startTime, endTime, velocity) {
        this.note = note;
        this.channel = channel;
        this.startTime = startTime;
        this.endTime = endTime;
        this.velocity = velocity;
        this.duration = endTime - startTime;

        // For split notes (continuations from previous time units)
        this.isSegment = false;
        this.originalStartTime = null;
        this.originalEndTime = null;
    }

    /**
     * Create note blocks from MIDI events
     */
    static createNoteBlocks(events, timeUnit) {
        const blocks = [];
        const noteStates = new Map();

        for (const event of events) {
            const noteKey = `${event.note}-${event.channel}`;

            if (event.type === 'noteOn') {
                noteStates.set(noteKey, event);
            } else if (event.type === 'noteOff' && noteStates.has(noteKey)) {
                const startEvent = noteStates.get(noteKey);
                const originalBlock = new NoteBlock(
                    event.note,
                    event.channel,
                    startEvent.timeInSeconds,
                    event.timeInSeconds,
                    startEvent.velocity
                );

                // Split the note block if it spans multiple time units
                const splitBlocks = NoteBlock.splitNoteBlockByTimeUnits(originalBlock, timeUnit);
                blocks.push(...splitBlocks);

                noteStates.delete(noteKey);
            }
        }

        return blocks;
    }

    /**
     * Split a note block into multiple blocks if it spans multiple time units
     */
    static splitNoteBlockByTimeUnits(block, timeUnit) {
        const splitBlocks = [];
        const timeUnitInSeconds = timeUnit;

        let currentStartTime = block.startTime;
        const finalEndTime = block.endTime;

        while (currentStartTime < finalEndTime) {
            // Calculate which time unit this segment starts in
            const currentWindowStart = Math.floor(currentStartTime / timeUnitInSeconds) * timeUnitInSeconds;
            const currentWindowEnd = currentWindowStart + timeUnitInSeconds;

            // Calculate the end time for this segment (either the note ends or the time unit ends)
            const segmentEndTime = Math.min(finalEndTime, currentWindowEnd);

            // Only create a segment if it has meaningful duration
            if (segmentEndTime > currentStartTime) {
                const newBlock = new NoteBlock(
                    block.note,
                    block.channel,
                    currentStartTime,
                    segmentEndTime,
                    block.velocity
                );

                // Mark as a segment if it's part of a longer note
                if (currentStartTime !== block.startTime || segmentEndTime !== block.endTime) {
                    newBlock.isSegment = true;
                    newBlock.originalStartTime = block.startTime;
                    newBlock.originalEndTime = block.endTime;
                }

                splitBlocks.push(newBlock);
            }

            // Move to the next time unit
            currentStartTime = currentWindowEnd;
        }

        return splitBlocks;
    }

    /**
     * Determine if this note should be shown at the current time
     */
    shouldShow(currentTime, windowStart, windowEnd) {
        const noteStartTime = this.startTime;
        const noteEndTime = this.endTime;

        // Show notes if they overlap with current time window
        const noteInWindow = (noteStartTime < windowEnd && noteEndTime > windowStart);

        // For segments of split notes (continuations from previous time units),
        // show them as soon as their time window is active
        if (this.isSegment && this.originalStartTime < windowStart) {
            // This is a continuation segment - show it if current time is in this window
            const currentTimeInWindow = (currentTime >= windowStart && currentTime < windowEnd);
            return noteInWindow && currentTimeInWindow;
        }

        // For regular notes (including the first segment of a split note),
        // show them only after they have actually started playing
        const noteHasStarted = (noteStartTime <= currentTime);
        return noteInWindow && noteHasStarted;
    }

    /**
     * Check if this note is currently playing
     */
    isCurrentlyPlaying(currentTime) {
        // Use original note bounds if this is a segment
        const originalStartTime = this.originalStartTime || this.startTime;
        const originalEndTime = this.originalEndTime || this.endTime;

        return (originalStartTime <= currentTime && originalEndTime > currentTime);
    }
}
