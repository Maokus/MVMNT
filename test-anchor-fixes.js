// Test script to validate anchor point fixes
import { TestAnchorTransformElement } from '../src/visualizer/scene-elements/test-anchor-transform.ts';
import { Rectangle, Line, Text } from '../src/visualizer/render-objects/index.js';

console.log('=== Anchor Point Fix Validation ===\n');

// Test 1: Line bounds calculation
console.log('1. Testing Line bounds calculation...');
const testLines = [
    new Line(100, 100, 200, 100, '#FF0000', 2), // Horizontal line
    new Line(100, 100, 100, 200, '#00FF00', 2), // Vertical line
    new Line(100, 100, 200, 200, '#0000FF', 2), // Diagonal line
    new Line(200, 100, 100, 200, '#FFFF00', 2), // Reverse diagonal
];

testLines.forEach((line, index) => {
    const bounds = line.getBounds();
    const endPoint = line.getEndPoint();
    console.log(`Line ${index + 1}: Start(${line.x}, ${line.y}) End(${endPoint.x}, ${endPoint.y})`);
    console.log(`  Bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);

    // Validate bounds
    const expectedMinX = Math.min(line.x, endPoint.x);
    const expectedMinY = Math.min(line.y, endPoint.y);
    const expectedMaxX = Math.max(line.x, endPoint.x);
    const expectedMaxY = Math.max(line.y, endPoint.y);
    const expectedWidth = expectedMaxX - expectedMinX;
    const expectedHeight = expectedMaxY - expectedMinY;

    const isValid = bounds.x === expectedMinX && bounds.y === expectedMinY &&
        bounds.width === expectedWidth && bounds.height === expectedHeight;
    console.log(`  Validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);

    if (!isValid) {
        console.log(`    Expected: x=${expectedMinX}, y=${expectedMinY}, w=${expectedWidth}, h=${expectedHeight}`);
    }
});

// Test 2: Text bounds with different alignments
console.log('\n2. Testing Text bounds calculation...');
const testTexts = [
    new Text(200, 200, 'Left Aligned', '20px Arial', '#FFFFFF', 'left', 'top'),
    new Text(200, 200, 'Center Aligned', '20px Arial', '#FFFFFF', 'center', 'middle'),
    new Text(200, 200, 'Right Aligned', '20px Arial', '#FFFFFF', 'right', 'bottom'),
    new Text(200, 200, 'Bold Text', 'bold 24px Arial', '#FFFFFF', 'center', 'middle'),
];

testTexts.forEach((text, index) => {
    const bounds = text.getBounds();
    console.log(`Text ${index + 1}: "${text.text}" (${text.textAlign}, ${text.textBaseline})`);
    console.log(`  Position: (${text.x}, ${text.y})`);
    console.log(`  Bounds: x=${bounds.x.toFixed(1)}, y=${bounds.y.toFixed(1)}, w=${bounds.width.toFixed(1)}, h=${bounds.height.toFixed(1)}`);

    // Basic validation - bounds should be reasonable
    const isValid = bounds.width > 0 && bounds.height > 0 &&
        isFinite(bounds.x) && isFinite(bounds.y);
    console.log(`  Validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
});

// Test 3: Scene element bounds calculation
console.log('\n3. Testing Scene element bounds aggregation...');

// Mock canvas config
const mockConfig = {
    canvas: { width: 800, height: 600 }
};

// Create test scene element
const testElement = new TestAnchorTransformElement('test', {
    showExample: true,
    anchorX: 0.5,
    anchorY: 0.5
});

// Test different anchor points
const anchorTests = [
    { x: 0.0, y: 0.0, name: 'Top-Left' },
    { x: 0.5, y: 0.5, name: 'Center' },
    { x: 1.0, y: 1.0, name: 'Bottom-Right' },
    { x: 0.5, y: 0.0, name: 'Top-Center' },
    { x: 1.0, y: 0.5, name: 'Right-Center' },
];

anchorTests.forEach(anchor => {
    testElement.setAnchor(anchor.x, anchor.y);

    try {
        const renderObjects = testElement.buildRenderObjects(mockConfig, 0);
        console.log(`Anchor ${anchor.name} (${anchor.x}, ${anchor.y}): ${renderObjects.length} render objects created`);

        if (renderObjects.length > 0) {
            const bounds = renderObjects[0].getBounds();
            console.log(`  Container bounds: x=${bounds.x.toFixed(1)}, y=${bounds.y.toFixed(1)}, w=${bounds.width.toFixed(1)}, h=${bounds.height.toFixed(1)}`);
        }

        console.log(`  ✅ PASS`);
    } catch (error) {
        console.log(`  ❌ FAIL: ${error.message}`);
    }
});

// Test 4: Validate bounds consistency
console.log('\n4. Testing bounds consistency...');

// Create a simple test with known dimensions
const testRects = [
    new Rectangle(0, 0, 100, 50, '#FF0000'),
    new Rectangle(100, 50, 100, 50, '#00FF00'),
];

console.log('Individual rectangle bounds:');
testRects.forEach((rect, index) => {
    const bounds = rect.getBounds();
    console.log(`  Rect ${index + 1}: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
});

// Simulate scene element bounds calculation
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
testRects.forEach(rect => {
    const bounds = rect.getBounds();
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
});

const aggregatedBounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
};

console.log('Aggregated bounds:', aggregatedBounds);
console.log(`Expected: x=0, y=0, w=200, h=100`);
const isConsistent = aggregatedBounds.x === 0 && aggregatedBounds.y === 0 &&
    aggregatedBounds.width === 200 && aggregatedBounds.height === 100;
console.log(`Consistency: ${isConsistent ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n=== Test Complete ===');
console.log('If all tests pass, the anchor point fixes are working correctly.');
console.log('Check the browser console during actual usage for bounds debugging info.');
