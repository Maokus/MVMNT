# Property Binding System Migration Guide

This document describes the new property binding system that replaces the previous macro assignment system.

## Overview

The new property binding system provides a cleaner, more maintainable approach to managing properties and macro assignments in scene elements. Instead of storing assignments separately from properties, each property now holds a binding that can either be a constant value or a reference to a macro.

## Key Changes

### Before (Old System)
```javascript
// Scene element properties stored as direct values
element.bpm = 120;
element.beatsPerBar = 4;

// Macro assignments stored separately
macroManager.assignMacroToProperty('tempo', 'piano1', 'bpm');

// Serialization includes separate assignments section
{
  elements: [{ id: 'piano1', bpm: 120, beatsPerBar: 4 }],
  macros: { tempo: { value: 140 } },
  assignments: { tempo: [{ elementId: 'piano1', propertyPath: 'bpm' }] }
}
```

### After (New System)
```javascript
// Properties managed through bindings
element.setProperty('bpm', 120);  // Creates constant binding
element.bindToMacro('bpm', 'tempo');  // Creates macro binding

// Serialization includes binding info with properties
{
  elements: [{
    id: 'piano1',
    bpm: { type: 'macro', macroId: 'tempo' },
    beatsPerBar: { type: 'constant', value: 4 }
  }],
  macros: { tempo: { value: 140 } }
  // No separate assignments section needed!
}
```

## New Classes and Concepts

### PropertyBinding
Abstract base class for all property bindings.

### ConstantBinding
Holds a direct value (equivalent to old direct property storage).

### MacroBinding
References a macro by ID (equivalent to old macro assignment).

### BoundSceneElement
Enhanced scene element base class that uses property bindings instead of direct properties.

### BoundHybridSceneBuilder
Enhanced scene builder with support for the new serialization format.

## Migration Steps

### 1. Update Scene Elements

**Old:**
```javascript
class MyElement extends SceneElement {
  constructor(id, config) {
    super('myElement', id, config);
    this.myProperty = config.myProperty || 'default';
  }
}
```

**New:**
```javascript
class BoundMyElement extends BoundSceneElement {
  constructor(id, config) {
    super('boundMyElement', id, config);
    // Properties are automatically initialized from schema
  }
  
  getMyProperty() {
    return this.getProperty('myProperty');
  }
  
  setMyProperty(value) {
    this.setProperty('myProperty', value);
    return this;
  }
  
  bindMyPropertyToMacro(macroId) {
    this.bindToMacro('myProperty', macroId);
    return this;
  }
}
```

### 2. Update Serialization/Deserialization

**Old:**
```javascript
// Serialization
const sceneData = sceneBuilder.serializeScene();
// Results in old format with separate assignments

// Deserialization
sceneBuilder.loadScene(sceneData);
// Requires separate macro assignment restoration
```

**New:**
```javascript
// Serialization
const boundSceneBuilder = new BoundHybridSceneBuilder();
const sceneData = boundSceneBuilder.serializeScene();
// Results in new format with embedded bindings

// Deserialization
boundSceneBuilder.loadScene(sceneData);
// Automatically handles binding restoration
```

### 3. Update Macro Usage

**Old:**
```javascript
// Create element
const element = new TimeUnitPianoRollElement('piano1');

// Set initial value
element.bpm = 120;

// Assign to macro
macroManager.assignMacroToProperty('tempo', 'piano1', 'bpm');

// Update macro value
macroManager.updateMacroValue('tempo', 140);
// Element.bpm automatically becomes 140
```

**New:**
```javascript
// Create bound element
const element = new BoundTimeUnitPianoRollElement('piano1');

// Set initial value (creates constant binding)
element.setBPM(120);

// Bind to macro
element.bindBPMToMacro('tempo');

// Update macro value
macroManager.updateMacroValue('tempo', 140);
// Element.getBPM() automatically returns 140
```

## Benefits of the New System

1. **Cleaner Serialization**: Binding information is stored directly with properties, eliminating the need for a separate assignments section.

2. **Better Encapsulation**: Each element manages its own property bindings, making the system more modular.

3. **Easier Debugging**: You can easily see which properties are bound to which macros by inspecting the element's configuration.

4. **Type Safety**: The new system provides better TypeScript support with proper typing for property values.

5. **MIDI File Management**: MIDI data is now properly encapsulated within elements rather than stored at the scene level.

6. **Backward Compatibility**: The new system can load old scene files and automatically convert them to the new format.

## Migration Example: TimeUnitPianoRoll

### Old Implementation
```javascript
// midiData and midiFileName incorrectly stored at scene level
const sceneData = {
  elements: [
    { id: 'piano1', type: 'timeUnitPianoRoll', bpm: 120 }
  ],
  midiData: { /* MIDI events */ },
  midiFileName: 'song.mid',
  assignments: {
    tempo: [{ elementId: 'piano1', propertyPath: 'bpm' }]
  }
};
```

### New Implementation
```javascript
// MIDI data properly encapsulated in macro, referenced by element
const sceneData = {
  elements: [
    {
      id: 'piano1',
      type: 'boundTimeUnitPianoRoll',
      bpm: { type: 'macro', macroId: 'tempo' },
      midiFile: { type: 'macro', macroId: 'midiFile' }
    }
  ],
  macros: {
    tempo: { value: 120, type: 'number' },
    midiFile: { value: midiFileBlob, type: 'file' }
  }
};
```

## API Reference

### BoundSceneElement Methods

- `getProperty<T>(key: string): T` - Get property value through binding
- `setProperty<T>(key: string, value: T): void` - Set property value
- `bindToMacro(propertyKey: string, macroId: string): void` - Bind property to macro
- `unbindFromMacro(propertyKey: string): void` - Convert macro binding to constant
- `isBoundToMacro(propertyKey: string, macroId: string): boolean` - Check if property is bound to specific macro
- `getMacroBoundProperties(): {[key: string]: string}` - Get all macro-bound properties
- `getSerializableConfig(): object` - Get configuration with binding metadata

### Property Binding Classes

- `ConstantBinding<T>` - Holds a constant value
- `MacroBinding<T>` - References a macro by ID
- `PropertyBindingUtils` - Utility functions for working with bindings

### BoundHybridSceneBuilder Methods

- `serializeScene(): object` - Serialize scene with binding information
- `loadScene(sceneData: object): boolean` - Load scene (handles both old and new formats)
- `createDefaultBoundScene(): this` - Create default scene with bound elements
- `autoBindElements(): void` - Automatically bind elements to appropriate macros

## Testing the New System

You can test the new system using the demonstration functions:

```javascript
import { 
  demonstratePropertyBindingSystem,
  demonstrateMIDIFileBinding,
  compareSerializationFormats
} from './property-binding-demo';

// Run demonstrations
demonstratePropertyBindingSystem();
demonstrateMIDIFileBinding();
compareSerializationFormats();
```

## Backward Compatibility

The new system maintains backward compatibility:

1. **Old Scene Files**: Can be loaded and automatically converted to the new format
2. **Legacy Elements**: Continue to work alongside new bound elements
3. **Macro Manager**: Retains all existing functionality while adding new features

The migration can be done gradually, element by element, without breaking existing functionality.
