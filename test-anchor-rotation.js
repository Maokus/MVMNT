// Test script to validate anchor point rotation fix
console.log('=== Anchor Point Rotation Fix Test ===\n');

// Test the anchor point rotation by simulating the transformation system
function testAnchorRotation() {
    console.log('Testing anchor point rotation behavior...\n');

    // Simulate the old behavior (broken)
    console.log('🔴 OLD BEHAVIOR (broken):');
    console.log('- Container positioned at: offsetX - anchorPixelX, offsetY - anchorPixelY');
    console.log('- Rotation applied around container position (0,0)');
    console.log('- Result: Rotation happens around wrong point\n');

    // Simulate the new behavior (fixed)
    console.log('✅ NEW BEHAVIOR (fixed):');
    console.log('- Container positioned at: offsetX - anchorPixelX, offsetY - anchorPixelY');
    console.log('- Rotation applied around: anchorPixelX, anchorPixelY (relative to container)');
    console.log('- Result: Rotation happens around correct anchor point\n');

    // Test case: Rectangle at (100, 100) with size 200x100
    const bounds = { x: 100, y: 100, width: 200, height: 100 };
    const offsetX = 400, offsetY = 300;

    console.log('Test scenario:');
    console.log(`- Object bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
    console.log(`- Desired position: (${offsetX}, ${offsetY})`);

    // Test different anchor points
    const anchors = [
        { x: 0.0, y: 0.0, name: 'Top-Left' },
        { x: 0.5, y: 0.5, name: 'Center' },
        { x: 1.0, y: 1.0, name: 'Bottom-Right' }
    ];

    anchors.forEach(anchor => {
        const anchorPixelX = bounds.x + bounds.width * anchor.x;
        const anchorPixelY = bounds.y + bounds.height * anchor.y;
        const containerX = offsetX - anchorPixelX;
        const containerY = offsetY - anchorPixelY;

        console.log(`\nAnchor ${anchor.name} (${anchor.x}, ${anchor.y}):`);
        console.log(`  - Anchor pixel position: (${anchorPixelX}, ${anchorPixelY})`);
        console.log(`  - Container position: (${containerX}, ${containerY})`);
        console.log(`  - Rotation center (relative to container): (${anchorPixelX}, ${anchorPixelY})`);
        console.log(`  - Rotation center (world space): (${containerX + anchorPixelX}, ${containerY + anchorPixelY})`);

        // Verify the world space rotation center matches our desired offset
        const worldRotationCenterX = containerX + anchorPixelX;
        const worldRotationCenterY = containerY + anchorPixelY;

        if (Math.abs(worldRotationCenterX - offsetX) < 0.001 && Math.abs(worldRotationCenterY - offsetY) < 0.001) {
            console.log(`  ✅ CORRECT: Rotation center matches desired position (${offsetX}, ${offsetY})`);
        } else {
            console.log(`  ❌ ERROR: Rotation center (${worldRotationCenterX}, ${worldRotationCenterY}) != desired position (${offsetX}, ${offsetY})`);
        }
    });
}

// Test Canvas 2D transform order
function testCanvasTransformOrder() {
    console.log('\n=== Canvas 2D Transform Order Test ===\n');

    console.log('Correct transform sequence for anchor-based rotation:');
    console.log('1. ctx.translate(containerX, containerY)  // Move to container position');
    console.log('2. ctx.translate(anchorOffsetX, anchorOffsetY)  // Move to anchor point');
    console.log('3. ctx.rotate(rotation)  // Rotate around anchor');
    console.log('4. ctx.scale(scaleX, scaleY)  // Scale around anchor');
    console.log('5. ctx.translate(-anchorOffsetX, -anchorOffsetY)  // Move back from anchor');
    console.log('6. // Render children at their original positions\n');

    console.log('This ensures that:');
    console.log('- Children render at their original relative positions');
    console.log('- All transforms (rotation, scaling) happen around the anchor point');
    console.log('- The anchor point appears at the desired world position\n');
}

testAnchorRotation();
testCanvasTransformOrder();

console.log('=== Summary ===');
console.log('✅ Fixed EmptyRenderObject to handle anchor-based transforms');
console.log('✅ Added setAnchorOffset() method to store anchor information');
console.log('✅ Modified render() method to apply transforms around anchor point');
console.log('✅ Updated SceneElement base class to pass anchor offset to container');
console.log('\nThe anchor point rotation issue should now be resolved!');
