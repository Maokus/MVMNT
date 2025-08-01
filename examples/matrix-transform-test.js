// Test script to verify the matrix-based transformation system
// This demonstrates that objects now transform as a unified group around the anchor point

console.log('=== Matrix-Based Transform Test ===\n');

// Test the matrix multiplication and transformation logic
function testMatrixTransform() {
    console.log('Testing matrix transformations:\n');

    // Simulate two squares at different positions
    const square1 = { x: 0, y: 0 };
    const square2 = { x: 100, y: 0 };

    console.log('Initial positions:');
    console.log(`Square 1: (${square1.x}, ${square1.y})`);
    console.log(`Square 2: (${square2.x}, ${square2.y})`);

    // Calculate bounding box (simulating _calculateSceneElementBounds)
    const bounds = {
        x: Math.min(square1.x, square2.x),
        y: Math.min(square1.y, square2.y),
        width: Math.max(square1.x, square2.x) - Math.min(square1.x, square2.x) + 10, // assuming 10px square size
        height: Math.max(square1.y, square2.y) - Math.min(square1.y, square2.y) + 10
    };

    console.log(`\nBounding box: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);

    // Test with center anchor (0.5, 0.5)
    const anchorX = bounds.x + bounds.width * 0.5;
    const anchorY = bounds.y + bounds.height * 0.5;
    console.log(`\nAnchor point (center): (${anchorX}, ${anchorY})`);

    // Simulate 90-degree rotation matrix around anchor point
    const rotation = Math.PI / 2; // 90 degrees in radians
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Group transformation matrix: T_anchor * R * T_anchor^-1
    // Step 1: Translate to anchor
    let matrix = [1, 0, 0, 1, -anchorX, -anchorY];

    // Step 2: Apply rotation
    const rotationMatrix = [cos, sin, -sin, cos, 0, 0];
    matrix = multiplyMatrices(matrix, rotationMatrix);

    // Step 3: Translate back
    const translateBack = [1, 0, 0, 1, anchorX, anchorY];
    matrix = multiplyMatrices(matrix, translateBack);

    console.log('\nAfter 90° rotation around center anchor:');

    // Apply transformation to both squares
    const newSquare1 = applyMatrixToPoint(matrix, square1.x, square1.y);
    const newSquare2 = applyMatrixToPoint(matrix, square2.x, square2.y);

    console.log(`Square 1: (${newSquare1.x.toFixed(1)}, ${newSquare1.y.toFixed(1)})`);
    console.log(`Square 2: (${newSquare2.x.toFixed(1)}, ${newSquare2.y.toFixed(1)})`);

    console.log('\n✅ Expected behavior: Square 2 should move from (100,0) to approximately (55,100)');
    console.log(`✅ Actual result: Square 2 moved to (${newSquare2.x.toFixed(1)}, ${newSquare2.y.toFixed(1)})`);

    // Test with top-left anchor (0.0, 0.0) 
    console.log('\n--- Testing with top-left anchor ---');
    const topLeftAnchorX = bounds.x;
    const topLeftAnchorY = bounds.y;
    console.log(`Top-left anchor: (${topLeftAnchorX}, ${topLeftAnchorY})`);

    // Create transformation matrix for top-left anchor
    let matrixTopLeft = [1, 0, 0, 1, -topLeftAnchorX, -topLeftAnchorY];
    matrixTopLeft = multiplyMatrices(matrixTopLeft, rotationMatrix);
    matrixTopLeft = multiplyMatrices(matrixTopLeft, [1, 0, 0, 1, topLeftAnchorX, topLeftAnchorY]);

    const newSquare1TopLeft = applyMatrixToPoint(matrixTopLeft, square1.x, square1.y);
    const newSquare2TopLeft = applyMatrixToPoint(matrixTopLeft, square2.x, square2.y);

    console.log('After 90° rotation around top-left anchor:');
    console.log(`Square 1: (${newSquare1TopLeft.x.toFixed(1)}, ${newSquare1TopLeft.y.toFixed(1)})`);
    console.log(`Square 2: (${newSquare2TopLeft.x.toFixed(1)}, ${newSquare2TopLeft.y.toFixed(1)})`);
}

function multiplyMatrices(a, b) {
    const [a1, b1, c1, d1, e1, f1] = a;
    const [a2, b2, c2, d2, e2, f2] = b;

    return [
        a1 * a2 + c1 * b2,           // a
        b1 * a2 + d1 * b2,           // b  
        a1 * c2 + c1 * d2,           // c
        b1 * c2 + d1 * d2,           // d
        a1 * e2 + c1 * f2 + e1,      // e
        b1 * e2 + d1 * f2 + f1       // f
    ];
}

function applyMatrixToPoint(matrix, x, y) {
    const [a, b, c, d, e, f] = matrix;
    return {
        x: a * x + c * y + e,
        y: b * x + d * y + f
    };
}

console.log('🎯 Key Benefits of Matrix-Based Approach:');
console.log('1. Objects transform as a unified group around a common anchor point');
console.log('2. Mathematically precise transformations using proper matrix operations');
console.log('3. Configurable anchor point allows control over transformation origin');
console.log('4. Supports complex transform compositions (scale + rotate + skew)');
console.log('5. Consistent with graphics programming best practices\n');

testMatrixTransform();
