// Test file to validate math.ts transformation functions
import {
    TransformProperties,
    createIdentityMatrix,
    createTranslationMatrix,
    createScaleMatrix,
    createRotationMatrix,
    createSkewMatrix,
    multiplyMatrices,
    composeTransformMatrix,
    decomposeTransformMatrix,
    createGroupTransformMatrix,
    validateMatrixRoundTrip
} from './math';

// Test basic matrix operations
function testBasicMatrices() {
    console.log('=== Testing Basic Matrix Operations ===');
    
    // Test identity matrix
    const identity = createIdentityMatrix();
    console.log('Identity matrix:', identity);
    
    // Test translation
    const translation = createTranslationMatrix(10, 20);
    console.log('Translation matrix (10, 20):', translation);
    
    // Test scale
    const scale = createScaleMatrix(2, 3);
    console.log('Scale matrix (2, 3):', scale);
    
    // Test rotation (45 degrees)
    const rotation = createRotationMatrix(Math.PI / 4);
    console.log('Rotation matrix (45°):', rotation);
    
    // Test skew
    const skew = createSkewMatrix(Math.PI / 6, 0);
    console.log('Skew matrix (30° X, 0° Y):', skew);
}

// Test matrix composition and decomposition
function testMatrixRoundTrip() {
    console.log('\n=== Testing Matrix Round Trip ===');
    
    const testCases: TransformProperties[] = [
        // Simple cases
        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 },
        { x: 0, y: 0, scaleX: 2, scaleY: 3, rotation: 0, skewX: 0, skewY: 0 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: Math.PI / 4, skewX: 0, skewY: 0 },
        
        // Complex cases
        { x: 100, y: 50, scaleX: 1.5, scaleY: 0.8, rotation: Math.PI / 3, skewX: 0, skewY: 0 },
        { x: -25, y: 75, scaleX: 0.5, scaleY: 2, rotation: -Math.PI / 6, skewX: 0, skewY: 0 },
        
        // With skew
        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: Math.PI / 12, skewY: 0 },
        { x: 30, y: 40, scaleX: 1.2, scaleY: 1.5, rotation: Math.PI / 8, skewX: Math.PI / 24, skewY: 0 },
    ];
    
    testCases.forEach((original, index) => {
        console.log(`\nTest case ${index + 1}:`);
        console.log('Original:', original);
        
        const matrix = composeTransformMatrix(original);
        console.log('Matrix:', matrix);
        
        const decomposed = decomposeTransformMatrix(matrix);
        console.log('Decomposed:', decomposed);
        
        const isValid = validateMatrixRoundTrip(original);
        console.log('Round trip valid:', isValid);
        
        if (!isValid) {
            console.log('⚠️  Round trip failed!');
            console.log('Differences:');
            console.log('  x:', Math.abs(decomposed.x - original.x));
            console.log('  y:', Math.abs(decomposed.y - original.y));
            console.log('  scaleX:', Math.abs(decomposed.scaleX - original.scaleX));
            console.log('  scaleY:', Math.abs(decomposed.scaleY - original.scaleY));
            console.log('  rotation:', Math.abs(decomposed.rotation - original.rotation));
            console.log('  skewX:', Math.abs(decomposed.skewX - original.skewX));
            console.log('  skewY:', Math.abs(decomposed.skewY - original.skewY));
        }
    });
}

// Test transform order consistency
function testTransformOrder() {
    console.log('\n=== Testing Transform Order ===');
    
    const props: TransformProperties = {
        x: 100, y: 50,
        scaleX: 2, scaleY: 1.5,
        rotation: Math.PI / 4,
        skewX: 0, skewY: 0
    };
    
    // Method 1: Using composeTransformMatrix
    const matrix1 = composeTransformMatrix(props);
    console.log('Method 1 (composeTransformMatrix):', matrix1);
    
    // Method 2: Manual composition in documented order
    let matrix2 = createIdentityMatrix();
    matrix2 = multiplyMatrices(createTranslationMatrix(props.x, props.y), matrix2);
    matrix2 = multiplyMatrices(createRotationMatrix(props.rotation), matrix2);
    matrix2 = multiplyMatrices(createScaleMatrix(props.scaleX, props.scaleY), matrix2);
    console.log('Method 2 (manual composition):', matrix2);
    
    // Check if they're the same
    const diff = matrix1.map((val, i) => Math.abs(val - matrix2[i]));
    const maxDiff = Math.max(...diff);
    console.log('Max difference between methods:', maxDiff);
    console.log('Methods match:', maxDiff < 0.0001);
}

// Test group transform with anchor point
function testGroupTransform() {
    console.log('\n=== Testing Group Transform with Anchor Point ===');
    
    const anchorX = 50, anchorY = 30;
    const scaleX = 2, scaleY = 1.5;
    const rotation = Math.PI / 6;
    const skewX = 0, skewY = 0;
    
    const matrix = createGroupTransformMatrix(anchorX, anchorY, scaleX, scaleY, rotation, skewX, skewY);
    console.log('Group transform matrix:', matrix);
    
    // Test that the anchor point stays in place
    const transformedAnchor = {
        x: matrix[0] * anchorX + matrix[2] * anchorY + matrix[4],
        y: matrix[1] * anchorX + matrix[3] * anchorY + matrix[5]
    };
    
    console.log('Original anchor point:', { x: anchorX, y: anchorY });
    console.log('Transformed anchor point:', transformedAnchor);
    console.log('Anchor point difference:', {
        x: Math.abs(transformedAnchor.x - anchorX),
        y: Math.abs(transformedAnchor.y - anchorY)
    });
    
    const anchorStaysInPlace = 
        Math.abs(transformedAnchor.x - anchorX) < 0.0001 && 
        Math.abs(transformedAnchor.y - anchorY) < 0.0001;
    console.log('Anchor point stays in place:', anchorStaysInPlace);
}

// Run all tests
export function runMathTests() {
    testBasicMatrices();
    testMatrixRoundTrip();
    testTransformOrder();
    testGroupTransform();
}

// Auto-run if this file is executed directly
if (require.main === module) {
    runMathTests();
}
