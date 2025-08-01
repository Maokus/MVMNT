// Test script for the new math.ts module
// This helps debug matrix operations and validate the transformation system

import {
    createRotationMatrix,
    createTranslationMatrix,
    radiansToDegrees,
    composeTransformMatrix,
    decomposeTransformMatrix,
    createGroupTransformMatrix,
    multiplyMatrices,
    validateMatrixRoundTrip,
    transformPoint,
    Matrix2D
} from '../src/lib/math.js';

console.log('=== Math Module Test Suite ===\n');

function testBasicMatrixOperations() {
    console.log('1. Testing basic matrix operations...\n');

    // Test simple transformation
    const simpleTransform = {
        x: 100,
        y: 50,
        scaleX: 2,
        scaleY: 1.5,
        rotation: Math.PI / 4, // 45 degrees
        skewX: 0,
        skewY: 0
    };

    console.log('Original transform:', simpleTransform);

    const matrix = composeTransformMatrix(simpleTransform);
    console.log('Composed matrix:', matrix.map(n => n.toFixed(3)));

    const decomposed = decomposeTransformMatrix(matrix);
    console.log('Decomposed transform:', decomposed);

    const isValid = validateMatrixRoundTrip(simpleTransform);
    console.log('Round-trip validation:', isValid ? '✅ PASS' : '❌ FAIL');

    console.log('');
}

function testGroupTransformation() {
    console.log('2. Testing group transformation (the two squares example)...\n');

    // Two objects like in the original problem
    const obj1 = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 };
    const obj2 = { x: 100, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 };

    console.log('Initial objects:');
    console.log('Object 1:', obj1);
    console.log('Object 2:', obj2);

    // Group bounds and anchor
    const bounds = { x: 0, y: 0, width: 100, height: 0 };
    const anchorX = bounds.x + bounds.width * 0.0; // top-left anchor
    const anchorY = bounds.y + bounds.height * 0.0;

    console.log(`\nAnchor point (top-left): (${anchorX}, ${anchorY})`);

    // Create group transformation matrix (90° rotation)
    const groupMatrix = createGroupTransformMatrix(
        anchorX, anchorY,    // anchor
        1, 1,                // no scaling
        Math.PI / 2,         // 90° rotation
        0, 0                 // no skew
    );

    console.log('Group matrix:', groupMatrix.map(n => n.toFixed(3)));

    console.log('\nAfter applying group transformation:');

    [obj1, obj2].forEach((obj, i) => {
        // Compose object matrix
        const objMatrix = composeTransformMatrix(obj);

        // Apply group transformation
        const resultMatrix = multiplyMatrices(groupMatrix, objMatrix);

        // Decompose result
        const transforms = decomposeTransformMatrix(resultMatrix);

        console.log(`Object ${i + 1}: (${transforms.x.toFixed(1)}, ${transforms.y.toFixed(1)})`);
    });

    console.log('\n✅ Expected: Object 2 should move from (100,0) to (0,100)');
    console.log('');
}

function testComplexTransformations() {
    console.log('3. Testing complex transformations...\n');

    // Test with more complex transforms
    const complexTransform = {
        x: 50,
        y: 30,
        scaleX: 1.5,
        scaleY: 0.8,
        rotation: Math.PI / 6, // 30 degrees
        skewX: Math.PI / 12,   // 15 degrees
        skewY: 0
    };

    console.log('Complex transform:', {
        ...complexTransform,
        rotation: `${(complexTransform.rotation * 180 / Math.PI).toFixed(1)}°`,
        skewX: `${(complexTransform.skewX * 180 / Math.PI).toFixed(1)}°`
    });

    const isValid = validateMatrixRoundTrip(complexTransform, 0.01);
    console.log('Round-trip validation:', isValid ? '✅ PASS' : '❌ FAIL');

    // Test point transformation
    const testPoint = { x: 10, y: 20 };
    const matrix = composeTransformMatrix(complexTransform);
    const transformedPoint = transformPoint(matrix, testPoint.x, testPoint.y);

    console.log(`Point (${testPoint.x}, ${testPoint.y}) transforms to (${transformedPoint.x.toFixed(2)}, ${transformedPoint.y.toFixed(2)})`);
    console.log('');
}

function testMatrixDebugging() {
    console.log('4. Matrix debugging utilities...\n');

    // Test different transform combinations to identify issues
    const testCases = [
        { name: 'Translation only', x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        { name: 'Scale only', x: 0, y: 0, scaleX: 2, scaleY: 1.5, rotation: 0, skewX: 0, skewY: 0 },
        { name: 'Rotation only', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: Math.PI / 4, skewX: 0, skewY: 0 },
        { name: 'Skew only', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: Math.PI / 12, skewY: 0 },
        { name: 'Combined', x: 50, y: 25, scaleX: 1.2, scaleY: 0.9, rotation: Math.PI / 8, skewX: Math.PI / 24, skewY: 0 }
    ];

    testCases.forEach(testCase => {
        const { name, ...transform } = testCase;
        const isValid = validateMatrixRoundTrip(transform, 0.001);
        console.log(`${name}: ${isValid ? '✅' : '❌'}`);

        if (!isValid) {
            console.log('  Original:', transform);
            const matrix = composeTransformMatrix(transform);
            const decomposed = decomposeTransformMatrix(matrix);
            console.log('  Decomposed:', decomposed);
            console.log('  Differences:');
            Object.keys(transform).forEach(key => {
                const diff = Math.abs(decomposed[key] - transform[key]);
                if (diff > 0.001) {
                    console.log(`    ${key}: ${diff.toFixed(6)} (original: ${transform[key].toFixed(6)}, decomposed: ${decomposed[key].toFixed(6)})`);
                }
            });
        }
    });
}

function testIdentityMatrix() {
    console.log('5. Identity matrix behavior...\n');

    const identityTransform = {
        x: 0, y: 0,
        scaleX: 1, scaleY: 1,
        rotation: 0,
        skewX: 0, skewY: 0
    };

    const matrix = composeTransformMatrix(identityTransform);
    const expected = [1, 0, 0, 1, 0, 0];
    const match = matrix.every((v, i) => Math.abs(v - expected[i]) < 1e-10);

    console.log(`Identity matrix test: ${match ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
}

function testRightAngleRotations() {
    console.log('6. Right-angle rotations (90°, 180°, 270°)...\n');

    const angles = [Math.PI / 2, Math.PI, 3 * Math.PI / 2]; // 90, 180, 270 degrees

    angles.forEach((angle, i) => {
        const transform = {
            x: 0, y: 0,
            scaleX: 1, scaleY: 1,
            rotation: angle,
            skewX: 0, skewY: 0
        };

        const isValid = validateMatrixRoundTrip(transform);
        console.log(`Rotation ${radiansToDegrees(angle)}°: ${isValid ? '✅' : '❌'}`);
    });

    console.log('');
}

function testZeroScale() {
    console.log('7. Zero scale edge cases...\n');

    const zeroScaleTransforms = [
        { name: 'Zero scaleX', x: 0, y: 0, scaleX: 0, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        { name: 'Zero scaleY', x: 0, y: 0, scaleX: 1, scaleY: 0, rotation: 0, skewX: 0, skewY: 0 },
        { name: 'Zero both', x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0, skewX: 0, skewY: 0 }
    ];

    zeroScaleTransforms.forEach(({ name, ...transform }) => {
        try {
            const matrix = composeTransformMatrix(transform);
            const decomposed = decomposeTransformMatrix(matrix);
            console.log(`${name}: matrix =`, matrix.map(n => n.toFixed(3)));
            console.log(`Decomposed:`, decomposed);
        } catch (e) {
            console.log(`${name}: ❌ ERROR - ${e.message}`);
        }
    });

    console.log('');
}

function testInverseTransformation() {
    console.log('8. Inverse point transformation...\n');

    const transform = {
        x: 20, y: 40,
        scaleX: 2, scaleY: 3,
        rotation: Math.PI / 6,
        skewX: 0, skewY: 0
    };

    const point = { x: 10, y: 15 };

    const matrix = composeTransformMatrix(transform);
    const transformed = transformPoint(matrix, point.x, point.y);

    // Invert the matrix numerically (simplified for 2D affine matrices)
    const [a, b, c, d, e, f] = matrix;
    const det = a * d - b * c;
    const invMatrix: Matrix2D = [
        d / det,
        -b / det,
        -c / det,
        a / det,
        (c * f - d * e) / det,
        (b * e - a * f) / det
    ];

    const original = transformPoint(invMatrix, transformed.x, transformed.y);

    const dx = Math.abs(original.x - point.x);
    const dy = Math.abs(original.y - point.y);

    const match = dx < 0.001 && dy < 0.001;

    console.log(`Point inversion test: ${match ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Original: (${point.x}, ${point.y})`);
    console.log(`After inverse: (${original.x.toFixed(3)}, ${original.y.toFixed(3)})\n`);
}

function testTransformOrder() {
    console.log('9. Transformation order sensitivity...\n');

    const translateThenRotate = multiplyMatrices(
        createRotationMatrix(Math.PI / 4),
        createTranslationMatrix(100, 0)
    );

    const rotateThenTranslate = multiplyMatrices(
        createTranslationMatrix(100, 0),
        createRotationMatrix(Math.PI / 4)
    );

    const areSame = translateThenRotate.every((val, i) => Math.abs(val - rotateThenTranslate[i]) < 0.0001);

    console.log('Are rotation→translate and translate→rotation equivalent?');
    console.log(areSame ? '❌ They should differ (correct)' : '✅ They differ (as expected)');
    console.log('');
}

// Run all tests
/*testBasicMatrixOperations();
testGroupTransformation();
testComplexTransformations();
testMatrixDebugging();

testRightAngleRotations();
testZeroScale();
testInverseTransformation();
testTransformOrder(); */

testIdentityMatrix();

console.log('=== Math Module Test Suite Completed ===\n');
