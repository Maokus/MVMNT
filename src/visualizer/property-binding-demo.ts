// Demonstration of the new Property Binding System
import { BoundTimeUnitPianoRollElement } from './scene-elements/time-unit-piano-roll/bound-time-unit-piano-roll';
import { BoundHybridSceneBuilder } from './bound-hybrid-scene-builder';
import { globalMacroManager } from './macro-manager';

/**
 * Demo function showing the new property binding system
 */
export function demonstratePropertyBindingSystem() {
    console.log('=== Property Binding System Demonstration ===');

    // 1. Create a bound scene builder
    const sceneBuilder = new BoundHybridSceneBuilder();
    
    // 2. Create default scene with bound elements
    sceneBuilder.createDefaultBoundScene();
    console.log('✓ Created default bound scene');

    // 3. Get a piano roll element to work with
    const pianoRollElements = sceneBuilder.getElementsByType('boundTimeUnitPianoRoll');
    if (pianoRollElements.length === 0) {
        console.log('❌ No piano roll elements found');
        return;
    }

    const pianoRoll = pianoRollElements[0] as BoundTimeUnitPianoRollElement;
    console.log(`✓ Working with piano roll element: ${pianoRoll.id}`);

    // 4. Demonstrate property access through bindings
    console.log('\n--- Property Access ---');
    console.log(`Current BPM: ${pianoRoll.getBPM()}`);
    console.log(`Current Beats per Bar: ${pianoRoll.getBeatsPerBar()}`);
    console.log(`Current Time Unit Bars: ${pianoRoll.getTimeUnitBars()}`);

    // 5. Demonstrate setting properties (creates constant bindings)
    console.log('\n--- Setting Properties ---');
    pianoRoll.setBPM(140);
    pianoRoll.setBeatsPerBar(3);
    console.log(`After setting: BPM=${pianoRoll.getBPM()}, Beats/Bar=${pianoRoll.getBeatsPerBar()}`);

    // 6. Demonstrate macro binding
    console.log('\n--- Macro Binding ---');
    
    // Create a custom macro
    globalMacroManager.createMacro('customTempo', 'number', 160, {
        min: 60,
        max: 200,
        step: 1,
        description: 'Custom tempo for demonstration'
    });

    // Bind the BPM property to our custom macro
    pianoRoll.bindToMacro('bpm', 'customTempo');
    console.log(`After binding to customTempo macro: BPM=${pianoRoll.getBPM()}`);

    // Change the macro value - this should update the element
    globalMacroManager.updateMacroValue('customTempo', 180);
    console.log(`After updating macro to 180: BPM=${pianoRoll.getBPM()}`);

    // 7. Demonstrate serialization
    console.log('\n--- Serialization ---');
    
    //const elementConfig = pianoRoll.getSerializableConfig();
    //console.log('Serialized element config (with bindings):');
    //console.log(JSON.stringify(elementConfig, null, 2));

    const sceneData = sceneBuilder.serializeScene();
    console.log('Serialized scene data:');
    console.log(JSON.stringify(sceneData, null, 2));
    console.log('Number of elements:', sceneData.elements.length);
    console.log('Number of macros:', Object.keys(sceneData.macros.macros).length);

    // 8. Demonstrate binding inspection
    console.log('\n--- Binding Inspection ---');
    const macroBoundProperties = pianoRoll.getMacroBoundProperties();
    console.log('Properties bound to macros:', macroBoundProperties);

    // Check specific bindings
    console.log(`BPM is bound to customTempo: ${pianoRoll.isBoundToMacro('bpm', 'customTempo')}`);
    console.log(`Beats per bar is bound to beatsPerBar: ${pianoRoll.isBoundToMacro('beatsPerBar', 'beatsPerBar')}`);

    // 9. Demonstrate deserialization
    console.log('\n--- Deserialization ---');
    
    // Create a new scene builder and load the serialized data
    const newSceneBuilder = new BoundHybridSceneBuilder();
    const loadSuccess = newSceneBuilder.loadScene(sceneData);
    console.log(`Scene loading ${loadSuccess ? 'succeeded' : 'failed'}`);

    if (loadSuccess) {
        const loadedPianoRolls = newSceneBuilder.getElementsByType('boundTimeUnitPianoRoll');
        if (loadedPianoRolls.length > 0) {
            const loadedElement = loadedPianoRolls[0] as BoundTimeUnitPianoRollElement;
            console.log(`Loaded element BPM: ${loadedElement.getBPM()}`);
            console.log(`Loaded element macro bindings:`, loadedElement.getMacroBoundProperties());
        }
    }

    console.log('\n=== Demonstration Complete ===');
    
    return {
        sceneBuilder,
        pianoRoll,
        serializedData: sceneData
    };
}

/**
 * Example of how MIDI file handling works with the new system
 */
export function demonstrateMIDIFileBinding() {
    console.log('\n=== MIDI File Binding Demonstration ===');

    const sceneBuilder = new BoundHybridSceneBuilder();
    sceneBuilder.createDefaultBoundScene();

    // Get piano roll element
    const pianoRoll = sceneBuilder.getElementsByType('boundTimeUnitPianoRoll')[0] as BoundTimeUnitPianoRollElement;

    // In the new system, MIDI files are bound to macros
    // This means multiple piano rolls can share the same MIDI file
    // and when the macro is updated, all bound elements are updated

    console.log('Current MIDI file:', pianoRoll.getMidiFile());

    // Simulate setting a MIDI file through the macro
    const mockMidiFile = new File(['mock midi data'], 'example.mid', { type: 'audio/midi' });
    globalMacroManager.updateMacroValue('midiFile', mockMidiFile);

    console.log('After setting macro - MIDI file name:', pianoRoll.getMidiFile()?.name);

    // Show that the MIDI file property is bound to the macro
    console.log('MIDI file is bound to midiFile macro:', pianoRoll.isBoundToMacro('midiFile', 'midiFile'));

    // In serialization, the MIDI file data would be stored in the macro section,
    // and the element would just reference the macro ID
    const config = pianoRoll.getSerializableConfig();
    console.log('MIDI file binding in serialization:', config.midiFile);

    console.log('=== MIDI File Binding Demo Complete ===');
}

/**
 * Demo function showing the improved macro binding and deletion handling
 */
export function demonstrateMacroBindingImprovements() {
    console.log('\n=== Macro Binding Improvements Demonstration ===');

    const sceneBuilder = new BoundHybridSceneBuilder();
    sceneBuilder.createDefaultBoundScene();

    // Get a piano roll element
    const pianoRoll = sceneBuilder.getElementsByType('boundTimeUnitPianoRoll')[0] as BoundTimeUnitPianoRollElement;
    
    // 1. Demonstrate property binding through macro assignment
    console.log('\n--- Property Binding Through Macro Assignment ---');
    
    // Create a custom macro
    globalMacroManager.createMacro('testTempo', 'number', 100, {
        min: 60,
        max: 200,
        step: 1,
        description: 'Test tempo macro for demonstration'
    });

    console.log('Before binding - BPM property type:', typeof pianoRoll.getBinding('bpm')?.type);
    console.log('Before binding - BPM value:', pianoRoll.getBPM());

    // Bind the BPM property to the macro (this now creates a MacroBinding instead of just updating the value)
    pianoRoll.bindToMacro('bpm', 'testTempo');
    
    console.log('After binding - BPM property type:', pianoRoll.getBinding('bpm')?.type);
    console.log('After binding - BPM value:', pianoRoll.getBPM());
    console.log('After binding - is bound to testTempo:', pianoRoll.isBoundToMacro('bpm', 'testTempo'));

    // Update the macro value and see it reflected in the element
    globalMacroManager.updateMacroValue('testTempo', 150);
    console.log('After macro update - BPM value:', pianoRoll.getBPM());

    // 2. Demonstrate macro deletion and conversion to constant binding
    console.log('\n--- Macro Deletion and Constant Binding Conversion ---');
    
    console.log('Before deletion - BPM binding type:', pianoRoll.getBinding('bpm')?.type);
    console.log('Before deletion - BPM value:', pianoRoll.getBPM());
    
    // Delete the macro - this should convert all macro bindings to constant bindings
    globalMacroManager.deleteMacro('testTempo');
    
    console.log('After deletion - BPM binding type:', pianoRoll.getBinding('bpm')?.type);
    console.log('After deletion - BPM value:', pianoRoll.getBPM());
    console.log('After deletion - is still bound to testTempo:', pianoRoll.isBoundToMacro('bpm', 'testTempo'));

    // 3. Demonstrate serialization without redundant assignment data
    console.log('\n--- Clean Serialization ---');
    
    const serializedData = sceneBuilder.serializeScene();
    console.log('Serialized macros count:', Object.keys(serializedData.macros.macros).length);
    console.log('Serialized assignments count (should be empty):', 
        Object.values(serializedData.macros.macros).map((m: any) => m.assignments.length).reduce((a, b) => a + b, 0));
    
    // Check that element properties contain binding information
    const serializedPianoRoll = serializedData.elements.find((e: any) => e.id === pianoRoll.id);
    if (serializedPianoRoll && (serializedPianoRoll as any).bpm) {
        console.log('BPM property in serialization:', (serializedPianoRoll as any).bpm);
    }

    console.log('=== Macro Binding Improvements Demo Complete ===');
}

/**
 * Show the difference between old and new serialization formats
 */
export function compareSerializationFormats() {
    console.log('\n=== Serialization Format Comparison ===');

    // Old format (conceptual - this is what we're replacing):
    const oldFormat = {
        version: '1.7.4',
        elements: [
            {
                id: 'piano1',
                type: 'timeUnitPianoRoll',
                bpm: 120,
                beatsPerBar: 4,
                midiFile: null,
                // ... other properties as direct values
            }
        ],
        macros: {
            tempo: { value: 140, type: 'number' },
            midiFile: { value: null, type: 'file' }
        },
        assignments: {
            tempo: [{ elementId: 'piano1', propertyPath: 'bpm' }],
            midiFile: [{ elementId: 'piano1', propertyPath: 'midiFile' }]
        },
        // MIDI data stored at scene level - problematic!
        midiData: { /* parsed MIDI */ },
        midiFileName: 'song.mid'
    };

    // New format:
    const newFormat = {
        version: "0.8.0",
        bindingSystemVersion: "1.0.0",
        elements: [
            {
                id: 'piano1',
                type: 'boundTimeUnitPianoRoll',
                bpm: { type: 'macro', macroId: 'tempo' },
                beatsPerBar: { type: 'constant', value: 4 },
                midiFile: { type: 'macro', macroId: 'midiFile' },
                // ... other properties as binding objects
            }
        ],
        macros: {
            tempo: { value: 140, type: 'number' },
            midiFile: { value: null, type: 'file' } // MIDI data stored here now
        }
        // No separate assignments section needed!
        // No scene-level MIDI data - it's per-element now!
    };

    console.log('Old format sample:');
    console.log(JSON.stringify(oldFormat, null, 2));

    console.log('\nNew format sample:');
    console.log(JSON.stringify(newFormat, null, 2));

    console.log('\nKey improvements:');
    console.log('1. ✓ Binding information is stored directly with properties');
    console.log('2. ✓ No separate assignments section needed');
    console.log('3. ✓ MIDI data is stored per-element, not at scene level');
    console.log('4. ✓ Clear distinction between constant and macro-bound values');
    console.log('5. ✓ Easier to understand and maintain');

    console.log('=== Comparison Complete ===');
}

demonstrateMacroBindingImprovements();
