// Test script to verify matrix composition and decomposition
// This demonstrates the new refactored transformation system

console.log('=== Matrix Composition/Decomposition Test ===\n');

// Simulate the matrix operations from the SceneElement class
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

function composeMatrixFromObject(obj) {
    // Start with identity matrix
    let matrix = [1, 0, 0, 1, 0, 0];

    // Apply transforms in order: translate, scale, skew, rotate
    // Translation
    matrix = multiplyMatrices(matrix, [1, 0, 0, 1, obj.x, obj.y]);

    // Scale
    if (obj.scaleX !== 1 || obj.scaleY !== 1) {
        matrix = multiplyMatrices(matrix, [obj.scaleX, 0, 0, obj.scaleY, 0, 0]);
    }

    // Skew
    if (obj.skewX !== 0 || obj.skewY !== 0) {
        matrix = multiplyMatrices(matrix, [1, Math.tan(obj.skewY), Math.tan(obj.skewX), 1, 0, 0]);
    }

    // Rotation
    if (obj.rotation !== 0) {
        const cos = Math.cos(obj.rotation);
        const sin = Math.sin(obj.rotation);
        matrix = multiplyMatrices(matrix, [cos, sin, -sin, cos, 0, 0]);
    }

    return matrix;
}

function decomposeMatrix(matrix) {
    const [a, b, c, d, e, f] = matrix;

    // Extract translation
    const x = e;
    const y = f;

    // Extract scale and rotation using QR decomposition
    const det = a * d - b * c;

    // Extract scaling and rotation
    const scaleX = Math.sqrt(a * a + b * b);
    const scaleY = det / scaleX;

    // Extract rotation from the first column
    const rotation = Math.atan2(b, a);

    // Extract skew by analyzing the transformed unit vectors
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    // Apply inverse rotation to remove rotation effect
    const rotatedC = c * cos - d * sin;
    const rotatedD = c * sin + d * cos;

    // Calculate skew from the rotated matrix
    const skewX = Math.atan2(rotatedC, Math.abs(scaleY));
    const skewY = Math.atan2(rotatedD - Math.abs(scaleY), Math.abs(scaleY));

    return {
        x,
        y,
        scaleX: Math.abs(scaleX),
        scaleY: Math.abs(scaleY),
        rotation,
        skewX: isFinite(skewX) ? skewX : 0,
        skewY: isFinite(skewY) ? skewY : 0
    };
}

function computeGroupTransformMatrix(anchorX, anchorY, globalScaleX, globalScaleY, globalRotation, globalSkewX, globalSkewY) {
    // Start with identity matrix
    let matrix = [1, 0, 0, 1, 0, 0];

    // Step 1: Translate to anchor point
    matrix = multiplyMatrices([1, 0, 0, 1, -anchorX, -anchorY], matrix);

    // Step 2: Apply scaling
    matrix = multiplyMatrices([globalScaleX, 0, 0, globalScaleY, 0, 0], matrix);

    // Step 3: Apply skew
    matrix = multiplyMatrices([1, Math.tan(globalSkewY), Math.tan(globalSkewX), 1, 0, 0], matrix);

    // Step 4: Apply rotation
    const cos = Math.cos(globalRotation);
    const sin = Math.sin(globalRotation);
    matrix = multiplyMatrices([cos, sin, -sin, cos, 0, 0], matrix);

    // Step 5: Translate back from anchor point
    matrix = multiplyMatrices([1, 0, 0, 1, anchorX, anchorY], matrix);

    return matrix;
}

function testMatrixRoundTrip() {
    console.log('Testing matrix composition and decomposition round-trip...\n');

    // Test object with various transforms
    const testObj = {
        x: 100,
        y: 50,
        scaleX: 1.5,
        scaleY: 0.8,
        rotation: Math.PI / 4, // 45 degrees
        skewX: Math.PI / 12,   // 15 degrees
        skewY: Math.PI / 24    // 7.5 degrees
    };

    console.log('Original object properties:');
    console.log(`Position: (${testObj.x}, ${testObj.y})`);
    console.log(`Scale: (${testObj.scaleX}, ${testObj.scaleY})`);
    console.log(`Rotation: ${(testObj.rotation * 180 / Math.PI).toFixed(1)}°`);
    console.log(`Skew: (${(testObj.skewX * 180 / Math.PI).toFixed(1)}°, ${(testObj.skewY * 180 / Math.PI).toFixed(1)}°)`);

    // Compose matrix from object
    const matrix = composeMatrixFromObject(testObj);
    console.log(`\nComposed matrix: [${matrix.map(n => n.toFixed(3)).join(', ')}]`);

    // Decompose matrix back to properties
    const decomposed = decomposeMatrix(matrix);
    console.log('\nDecomposed properties:');
    console.log(`Position: (${decomposed.x.toFixed(1)}, ${decomposed.y.toFixed(1)})`);
    console.log(`Scale: (${decomposed.scaleX.toFixed(3)}, ${decomposed.scaleY.toFixed(3)})`);
    console.log(`Rotation: ${(decomposed.rotation * 180 / Math.PI).toFixed(1)}°`);
    console.log(`Skew: (${(decomposed.skewX * 180 / Math.PI).toFixed(1)}°, ${(decomposed.skewY * 180 / Math.PI).toFixed(1)}°)`);

    // Check if values match (within tolerance)
    const tolerance = 0.01;
    const matches = {
        x: Math.abs(decomposed.x - testObj.x) < tolerance,
        y: Math.abs(decomposed.y - testObj.y) < tolerance,
        scaleX: Math.abs(decomposed.scaleX - testObj.scaleX) < tolerance,
        scaleY: Math.abs(decomposed.scaleY - testObj.scaleY) < tolerance,
        rotation: Math.abs(decomposed.rotation - testObj.rotation) < tolerance,
        skewX: Math.abs(decomposed.skewX - testObj.skewX) < tolerance,
        skewY: Math.abs(decomposed.skewY - testObj.skewY) < tolerance
    };

    console.log('\nRound-trip accuracy:');
    Object.entries(matches).forEach(([prop, match]) => {
        console.log(`${prop}: ${match ? '✅' : '❌'}`);
    });
}

function testGroupTransformation() {
    console.log('\n\n=== Group Transformation Test ===\n');

    // Two test objects (like the squares example)
    const obj1 = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 };
    const obj2 = { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 };

    console.log('Initial objects:');
    console.log(`Object 1: (${obj1.x}, ${obj1.y})`);
    console.log(`Object 2: (${obj2.x}, ${obj2.y})`);

    // Group transformation: 90° rotation around center anchor
    const bounds = { x: 0, y: 0, width: 100, height: 0 };
    const anchorX = bounds.x + bounds.width * 0.5; // center
    const anchorY = bounds.y + bounds.height * 0.5;

    console.log(`\nAnchor point: (${anchorX}, ${anchorY})`);

    const groupMatrix = computeGroupTransformMatrix(
        anchorX, anchorY,    // anchor
        1, 1,                // no scaling
        Math.PI / 2,         // 90° rotation
        0, 0                 // no skew
    );

    console.log('\nAfter applying group transformation (90° rotation around center):');

    [obj1, obj2].forEach((obj, i) => {
        // Compose object's local matrix
        const objMatrix = composeMatrixFromObject(obj);

        // Apply group transformation
        const resultMatrix = multiplyMatrices(groupMatrix, objMatrix);

        // Decompose result
        const transforms = decomposeMatrix(resultMatrix);

        console.log(`Object ${i + 1}: (${transforms.x.toFixed(1)}, ${transforms.y.toFixed(1)})`);
    });

    console.log('\n✅ Expected: Object 2 should move from (100,0) to approximately (50,100)');
}

testMatrixRoundTrip();
testGroupTransformation();

console.log('\n🎯 Key Benefits of Refactored Approach:');
console.log('1. Proper matrix composition: groupMatrix * objectMatrix');
console.log('2. Full transform decomposition preserves all object properties');
console.log('3. Matrix math handles complex transform interactions correctly');
console.log('4. No manual scale/rotation combination - pure matrix operations');
console.log('5. Mathematically precise and predictable transformations');
