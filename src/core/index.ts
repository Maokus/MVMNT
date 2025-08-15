// Merged visualizer module exports - Core and Rendering functionality

// ==========================================
// Core MIDI Processing Exports
// ==========================================
export { MIDIParser, parseMIDI } from '@core/midi/midi-parser';
export { NoteEvent } from '@core/midi/note-event';
export { ImageSequenceGenerator } from '../visualizer/image-sequence-generator';
export { MacroManager, globalMacroManager } from '../bindings/macro-manager';

// ==========================================
// Property Binding System Exports
// ==========================================
export { PropertyBinding, ConstantBinding, MacroBinding, PropertyBindingUtils } from '@bindings/property-bindings';
export type { PropertyBindingData } from '@bindings/property-bindings';
export { SceneElement } from '../visualizer/scene-elements/base';
export { TimeUnitPianoRollElement } from '../visualizer/scene-elements/time-unit-piano-roll/time-unit-piano-roll';
export { HybridSceneBuilder } from '@core/scene-builder';

// ==========================================
// Visualizer Rendering Exports
// ==========================================
export { MIDIVisualizerCore as MIDIVisualizer } from './visualizer-core.js';
export { ModularRenderer } from './render/modular-renderer.js';

// Scene management exports
export { SceneElementRegistry, sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

// Scene elements
export * from '../visualizer/scene-elements/index.js';

// Render objects
export * from '@core/render/render-objects';

// ==========================================
// Types Export
// ==========================================
export * from '@core/types';

// ==========================================
// Animation Utilities Export
// ==========================================
export { FloatCurve, AnimMath } from '@animation/animations';
