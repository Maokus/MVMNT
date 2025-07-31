// Note management class 
// Handles note state management and coordination with NoteBlock rendering
import { NoteBlock } from './note-block.js';
import { globalTimingManager } from './timing-manager.js';

export class NoteManager {
    constructor(timingManager = null) {
        this.noteBlocks = [];
        this.activeNotes = new Map();
        this.playedNoteEvents = 0;
        this.totalNoteEvents = 0;
        this.timingManager = timingManager || globalTimingManager;
    }

    /**
     * Load MIDI data and create note blocks
     */
    loadMIDIData(events, timeUnit) {
        // Clear existing data
        this.noteBlocks = [];
        this.activeNotes.clear();
        this.playedNoteEvents = 0;

        // Create note blocks from events
        this.noteBlocks = NoteBlock.createNoteBlocks(events, timeUnit);

        // Calculate total noteOn events
        this.totalNoteEvents = events.filter(event => event.type === 'noteOn').length;
    }

    /**
     * Update note blocks when timeUnit changes
     */
    updateTimeUnit(events, timeUnit) {
        if (events && events.length > 0) {
            this.noteBlocks = NoteBlock.createNoteBlocks(events, timeUnit);
        }
    }

    /**
     * Update active notes for current time
     */
    updateActiveNotes(events, currentTime) {
        this.activeNotes.clear();

        const currentEvents = events.filter(event =>
            Math.abs(event.timeInSeconds - currentTime) < 0.1
        );

        for (const event of currentEvents) {
            if (event.type === 'noteOn') {
                this.activeNotes.set(event.note, {
                    velocity: event.velocity,
                    channel: event.channel,
                    startTime: currentTime
                });
            } else if (event.type === 'noteOff') {
                this.activeNotes.delete(event.note);
            }
        }
    }

    /**
     * Update played note events counter
     */
    updatePlayedNoteEvents(events, currentTime) {
        // Count all noteOn events that have occurred up to current time
        let count = 0;
        for (const event of events) {
            if (event.type === 'noteOn' && event.timeInSeconds <= currentTime) {
                count++;
            }
        }
        this.playedNoteEvents = count;
    }

    /**
     * Reset tracking for seeking
     */
    resetTracking() {
        this.activeNotes.clear();
        this.playedNoteEvents = 0;
    }

    /**
     * Get played notes statistics
     */
    getPlayedNotesStats() {
        const playedCount = this.playedNoteEvents;
        const totalCount = this.totalNoteEvents;
        const percentage = totalCount > 0 ? Math.round((playedCount / totalCount) * 100) : 0;

        return {
            played: playedCount,
            total: totalCount,
            percentage: percentage
        };
    }

    /**
     * Get note blocks for rendering
     */
    getNoteBlocks() {
        return this.noteBlocks;
    }

    /**
     * Get active notes
     */
    getActiveNotes() {
        return this.activeNotes;
    }

    /**
     * Recalculate note timings when BPM changes
     */
    recalculateNoteTimings(oldBpm, newBpm, events, timeUnit) {
        if (oldBpm === newBpm || !events.length) return;

        // Use TimingManager to calculate the ratio
        const tempoRatio = this.timingManager.calculateTempoRatio(oldBpm, newBpm);

        // Update all event times
        for (const event of events) {
            event.timeInSeconds = this.timingManager.scaleTimeByTempo(event.timeInSeconds, tempoRatio);
        }

        // Recreate note blocks with new timing
        this.noteBlocks = NoteBlock.createNoteBlocks(events, timeUnit);
    }
}
