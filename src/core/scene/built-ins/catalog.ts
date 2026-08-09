import type { PluginElementDefinition } from '@mvmnt-app/plugin-sdk';
import { audioLockedOscilloscope } from './audio-displays/audio-locked-oscilloscope';
import { audioPeaks } from './audio-displays/audio-peaks';
import { audioSpectrogram } from './audio-displays/audio-spectrogram';
import { audioSpectrum } from './audio-displays/audio-spectrum';
import { audioVectorscope } from './audio-displays/audio-vectorscope';
import { audioVolumeMeter } from './audio-displays/audio-volume-meter';
import { audioWaveform } from './audio-displays/audio-waveform';
import { ccMonitor } from './midi-displays/cc-monitor';
import { chordEstimateDisplay } from './midi-displays/chord-estimate-display';
import { movingNotesPianoRoll } from './midi-displays/moving-notes-piano-roll/moving-notes-piano-roll';
import { notesPlayedTracker } from './midi-displays/note-count-tracker';
import { notesPlayingDisplay } from './midi-displays/notes-playing-display';
import { timeUnitPianoRoll } from './midi-displays/time-unit-piano-roll/time-unit-piano-roll';
import { background } from './misc/background';
import { basicShapes } from './misc/basic-shapes';
import { debug } from './misc/debug';
import { image } from './misc/image';
import { progressDisplay } from './misc/progress-display';
import { textOverlay } from './misc/text-overlay';
import { timeDisplay } from './misc/time-display';

type BuiltInDefinition = PluginElementDefinition<Readonly<Record<string, unknown>>, unknown, unknown>;

/** Ordered source of truth for every built-in registered by the application. */
export const builtInCatalog = [
    { type: 'background', definition: background },
    { type: 'basicShapes', definition: basicShapes },
    { type: 'image', definition: image },
    { type: 'progressDisplay', definition: progressDisplay },
    { type: 'textOverlay', definition: textOverlay },
    { type: 'timeDisplay', definition: timeDisplay },
    { type: 'timeUnitPianoRoll', definition: timeUnitPianoRoll },
    { type: 'movingNotesPianoRoll', definition: movingNotesPianoRoll },
    { type: 'notesPlayedTracker', definition: notesPlayedTracker },
    { type: 'notesPlayingDisplay', definition: notesPlayingDisplay },
    { type: 'chordEstimateDisplay', definition: chordEstimateDisplay },
    { type: 'ccMonitor', definition: ccMonitor },
    { type: 'audioSpectrum', definition: audioSpectrum },
    { type: 'audioVolumeMeter', definition: audioVolumeMeter },
    { type: 'audioWaveform', definition: audioWaveform },
    { type: 'audioPeaks', definition: audioPeaks },
    { type: 'audioLockedOscilloscope', definition: audioLockedOscilloscope },
    { type: 'audioSpectrogram', definition: audioSpectrogram },
    { type: 'audioVectorscope', definition: audioVectorscope },
    { type: 'debug', definition: debug },
] as const satisfies readonly { type: string; definition: BuiltInDefinition }[];

export type BuiltInElementType = (typeof builtInCatalog)[number]['type'];
