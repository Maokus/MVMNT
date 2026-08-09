// Merged visualizer module exports - Core and Rendering functionality

// ==========================================
// Core MIDI Processing Exports
// ==========================================
export { MIDIParser, parseMIDI } from '@core/midi/midi-parser';
export { NoteEvent } from '@core/midi/note-event';
// ==========================================
// Property Binding System Exports
// ==========================================
export { PropertyBinding, ConstantBinding, MacroBinding, PropertyBindingUtils } from '@bindings/property-bindings';
export type { PropertyBindingData, PropertyBindingContext } from '@bindings/property-bindings';
export { loadDefaultScene, resetToDefaultScene } from './default-scene-loader';

// ==========================================
// Visualizer Rendering Exports
// ==========================================
export { MIDIVisualizerCore as MIDIVisualizer } from './visualizer-core.js';
export { ModularRenderer } from './render/modular-renderer.js';

// Scene management exports
export { SceneElementRegistry, sceneElementRegistry } from '@core/scene/registry';

// Scene elements
export * from '@core/scene/built-ins';

// Render objects
export * from '@core/render/render-objects';

// ==========================================
// Types Export
// ==========================================
export * from '@core/types';

// ==========================================
// Animation Utilities Export
// ==========================================

// ==========================================
// Timing/Timeline exports
// ==========================================
export * as Timing from '@core/timing/index';
