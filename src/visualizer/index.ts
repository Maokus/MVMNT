// Merged visualizer module exports - Core and Rendering functionality

// ==========================================
// Core MIDI Processing Exports
// ==========================================
export { MIDIParser, parseMIDI } from './midi-parser';
export { TimingManager, globalTimingManager } from './timing-manager';
export { NoteManager } from './note-manager';
export { NoteBlock } from './note-block';
export { ImageSequenceGenerator } from './image-sequence-generator';
export { MacroManager, globalMacroManager } from './macro-manager';

// ==========================================
// Property Binding System Exports
// ==========================================
export { 
    PropertyBinding, 
    ConstantBinding, 
    MacroBinding, 
    PropertyBindingUtils
} from './property-bindings';
export type { PropertyBindingData } from './property-bindings';
export { BoundSceneElement } from './scene-elements/bound-base';
export { BoundTimeUnitPianoRollElement } from './scene-elements/time-unit-piano-roll/bound-time-unit-piano-roll';
export { BoundHybridSceneBuilder } from './bound-hybrid-scene-builder';

// ==========================================
// Visualizer Rendering Exports
// ==========================================
export { MIDIVisualizerCore as MIDIVisualizer } from './visualizer-core.js';
export { ModularRenderer } from './modular-renderer.js';
export { Easing } from './easing.js';

// Scene management exports
export { SceneElementRegistry, sceneElementRegistry } from './scene-element-registry.js';

// Scene elements
export * from './scene-elements/index.js';

// Render objects
export * from './render-objects/index.js';

// ==========================================
// Types Export
// ==========================================
export * from './types';
