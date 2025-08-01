// Demonstration of the new anchor point feature in SceneElements
// This example shows how different anchor points affect transformations

import { TestAnchorTransformElement } from '../src/visualizer/scene-elements/test-anchor-transform.js';

// Create a test scene element
const testElement = new TestAnchorTransformElement('demo', {
    showExample: true
});

console.log('=== Anchor Point Transformation Demo ===\n');

// Demonstrate different anchor points
const anchorTests = [
    { x: 0.0, y: 0.0, name: 'Top-Left Corner' },
    { x: 0.5, y: 0.5, name: 'Center (Default)' },
    { x: 1.0, y: 1.0, name: 'Bottom-Right Corner' },
    { x: 0.0, y: 1.0, name: 'Bottom-Left Corner' },
    { x: 1.0, y: 0.0, name: 'Top-Right Corner' }
];

console.log('Testing different anchor points:\n');

anchorTests.forEach((test, index) => {
    console.log(`${index + 1}. ${test.name} - Anchor: (${test.x}, ${test.y})`);

    // Set the anchor point
    testElement.setAnchor(test.x, test.y);

    // Apply a 45-degree rotation
    testElement.setGlobalRotation(45);

    console.log(`   - With 45° rotation, objects will rotate around the ${test.name.toLowerCase()}`);
    console.log(`   - Current anchor: (${testElement.anchorX}, ${testElement.anchorY})`);

    // Reset rotation for next test
    testElement.setGlobalRotation(0);

    console.log('');
});

console.log('=== Key Benefits ===');
console.log('1. Two squares at (0,0) and (100,0) with 90° rotation:');
console.log('   - OLD: Both squares rotate around their own centers');
console.log('   - NEW: Both squares rotate around the scene element\'s anchor point');
console.log('   - Result: Second square moves to approximately (0,100) as expected\n');

console.log('2. Configurable anchor points allow precise control:');
console.log('   - anchorX/Y = 0.5: Transform around center (default)');
console.log('   - anchorX/Y = 0.0: Transform around top-left');
console.log('   - anchorX/Y = 1.0: Transform around bottom-right');
console.log('   - Any value 0-1: Transform around specific relative position\n');

console.log('3. All transforms (rotation, scaling, skew) now use the anchor point');
console.log('4. Scene elements behave as unified objects rather than collections');

console.log('\n=== Usage ===');
console.log('// Set anchor to top-left corner');
console.log('element.setAnchor(0, 0);');
console.log('');
console.log('// Set anchor to center (default)');
console.log('element.setAnchor(0.5, 0.5);');
console.log('');
console.log('// Set anchor X and Y separately');
console.log('element.setAnchorX(0.25);');
console.log('element.setAnchorY(0.75);');
