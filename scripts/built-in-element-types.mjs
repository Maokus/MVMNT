/**
 * Canonical list of built-in scene element types.
 *
 * This file is the single source of truth for built-in types. It is imported
 * by build-plugin.mjs for build-time collision checks, and tested at runtime
 * against scene-element-registry to prevent drift.
 *
 * When adding or removing a built-in element, update this list.
 */
export const BUILTIN_ELEMENT_TYPES = [
    'background',
    'basicShapes',
    'image',
    'progressDisplay',
    'textOverlay',
    'timeDisplay',
    'timeUnitPianoRoll',
    'movingNotesPianoRoll',
    'notesPlayedTracker',
    'notesPlayingDisplay',
    'chordEstimateDisplay',
    'audioSpectrum',
    'audioVolumeMeter',
    'audioWaveform',
    'audioLockedOscilloscope',
    'debug',
];
