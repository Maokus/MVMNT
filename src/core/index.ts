// Merged visualizer module exports - Core and Rendering functionality

// ==========================================
// Core MIDI Processing Exports
// ==========================================
export { MIDIParser, parseMIDI } from '@core/midi/midi-parser';
export { NoteEvent } from '@core/midi/note-event';
export { ImageSequenceGenerator } from '@export/image-sequence-generator';
export { MacroManager, globalMacroManager } from '../bindings/macro-manager';

// ==========================================
// Property Binding System Exports
// ==========================================
export { PropertyBinding, ConstantBinding, MacroBinding, PropertyBindingUtils } from '@bindings/property-bindings';
export type { PropertyBindingData } from '@bindings/property-bindings';
export { HybridSceneBuilder } from '@core/scene-builder';

// ==========================================
// Visualizer Rendering Exports
// ==========================================
export { MIDIVisualizerCore as MIDIVisualizer } from './visualizer-core.js';
export { ModularRenderer } from './render/modular-renderer.js';

// Scene management exports
export { SceneElementRegistry, sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

// Scene elements
export * from '@core/scene/elements';

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
