let sequence = 0;

/**
 * Merge key shared by the commands of one UI gesture (a drag or delete that
 * spans both MIDI and audio clips) so they collapse into a single undo entry.
 * Unique per call so separate gestures never merge together.
 */
export function nextCommitGroupKey(): string {
    sequence += 1;
    return `timeline-commit:${sequence}`;
}
