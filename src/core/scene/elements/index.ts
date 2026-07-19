// Export scene elements
export {
    SceneElement,
    asBoolean,
    asNumber,
    asString,
    asTrimmedString,
    type PropertyDescriptor,
    type PropertyDescriptorMap,
    type PropertySnapshot,
    type PropertyTransform,
} from './base';
export { BackgroundElement, background } from './misc/background';
export { BasicShapesElement, basicShapes } from './misc/basic-shapes';
export { ImageElement, image } from './misc/image';
export { ProgressDisplayElement, progressDisplay } from './misc/progress-display';
export { TextOverlayElement, textOverlay } from './misc/text-overlay';
export { TimeDisplayElement, timeDisplay } from './misc/time-display';
export { DebugElement, debug } from './misc/debug';
export { TimeUnitPianoRollElement, timeUnitPianoRoll } from './midi-displays/time-unit-piano-roll/time-unit-piano-roll';
export {
    MovingNotesPianoRollElement,
    movingNotesPianoRoll,
} from './midi-displays/moving-notes-piano-roll/moving-notes-piano-roll';
export { NoteCountTrackerElement, notesPlayedTracker } from './midi-displays/note-count-tracker';
export { NotesPlayingDisplayElement, notesPlayingDisplay } from './midi-displays/notes-playing-display';
export { ChordEstimateDisplayElement, chordEstimateDisplay } from './midi-displays/chord-estimate-display';
export { CCMonitorElement, ccMonitor } from './midi-displays/cc-monitor';
export { AudioSpectrumElement, audioSpectrum } from './audio-displays/audio-spectrum';
export { AudioVolumeMeterElement, audioVolumeMeter } from './audio-displays/audio-volume-meter';
export { AudioWaveformElement, audioWaveform } from './audio-displays/audio-waveform';
export { AudioPeaksElement, audioPeaks } from './audio-displays/audio-peaks';
export { AudioLockedOscilloscopeElement, audioLockedOscilloscope } from './audio-displays/audio-locked-oscilloscope';
