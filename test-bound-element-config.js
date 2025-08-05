// Test script to verify bound element configuration handling
const { BoundSceneElement } = require('./src/visualizer/scene-elements/bound-base.ts');
const { BoundHybridSceneBuilder } = require('./src/visualizer/bound-hybrid-scene-builder.js');

// Create a test scene builder
const sceneBuilder = new BoundHybridSceneBuilder();

console.log('Testing bound element configuration handling...');

// Test 1: Create a bound time unit piano roll element
try {
    const success = sceneBuilder.addElement('boundTimeUnitPianoRoll', 'test-element');
    console.log('✓ Successfully created bound time unit piano roll element:', success);
} catch (error) {
    console.error('✗ Failed to create bound time unit piano roll element:', error);
}

// Test 2: Update element configuration
try {
    const updateSuccess = sceneBuilder.updateElementConfig('test-element', {
        visible: false,
        zIndex: 5,
        offsetX: 100
    });
    console.log('✓ Successfully updated element configuration:', updateSuccess);
} catch (error) {
    console.error('✗ Failed to update element configuration:', error);
}

// Test 3: Get element configuration
try {
    const config = sceneBuilder.getElementConfig('test-element');
    console.log('✓ Successfully retrieved element configuration:', config);
} catch (error) {
    console.error('✗ Failed to get element configuration:', error);
}

console.log('Test completed.');
