// Test to debug transform issues with Line vs Rectangle
// Inline the math functions for testing
function createIdentityMatrix() {
    return [1, 0, 0, 1, 0, 0];
}

function createTranslationMatrix(x, y) {
    return [1, 0, 0, 1, x, y];
}

function createScaleMatrix(scaleX, scaleY) {
    return [scaleX, 0, 0, scaleY, 0, 0];
}

function createRotationMatrix(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [cos, sin, -sin, cos, 0, 0];
}

function createSkewMatrix(skewX, skewY) {
    return [1, Math.tan(skewY), Math.tan(skewX), 1, 0, 0];
}

function multiplyMatrices(a, b) {
    const [a1, a2, a3, a4, a5, a6] = a;
    const [b1, b2, b3, b4, b5, b6] = b;

    return [
        a1 * b1 + a3 * b2,
        a2 * b1 + a4 * b2,
        a1 * b3 + a3 * b4,
        a2 * b3 + a4 * b4,
        a1 * b5 + a3 * b6 + a5,
        a2 * b5 + a4 * b6 + a6
    ];
}

function composeTransformMatrix(props) {
    let matrix = createIdentityMatrix();

    if (props.x !== 0 || props.y !== 0) {
        matrix = multiplyMatrices(createTranslationMatrix(props.x, props.y), matrix);
    }

    if (props.rotation !== 0) {
        matrix = multiplyMatrices(createRotationMatrix(props.rotation), matrix);
    }

    if (props.skewX !== 0 || props.skewY !== 0) {
        matrix = multiplyMatrices(createSkewMatrix(props.skewX, props.skewY), matrix);
    }

    if (props.scaleX !== 1 || props.scaleY !== 1) {
        matrix = multiplyMatrices(createScaleMatrix(props.scaleX, props.scaleY), matrix);
    }

    return matrix;
}

function createGroupTransformMatrix(anchorX, anchorY, scaleX, scaleY, rotation, skewX, skewY) {
    let matrix = createIdentityMatrix();

    matrix = multiplyMatrices(createTranslationMatrix(-anchorX, -anchorY), matrix);

    if (scaleX !== 1 || scaleY !== 1) {
        matrix = multiplyMatrices(createScaleMatrix(scaleX, scaleY), matrix);
    }

    if (skewX !== 0 || skewY !== 0) {
        matrix = multiplyMatrices(createSkewMatrix(skewX, skewY), matrix);
    }

    if (rotation !== 0) {
        matrix = multiplyMatrices(createRotationMatrix(rotation), matrix);
    }

    matrix = multiplyMatrices(createTranslationMatrix(anchorX, anchorY), matrix);

    return matrix;
}

function decomposeTransformMatrix(matrix) {
    const [a, b, c, d, e, f] = matrix;

    const x = e;
    const y = f;

    const det = a * d - b * c;

    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);

    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    const shearAndScaleY = c * cos + d * sin;
    const scaleY = -c * sin + d * cos;

    const skewX = Math.atan2(shearAndScaleY, scaleY);

    const finalScaleX = det < 0 ? -scaleX : scaleX;
    const finalScaleY = Math.abs(scaleY);

    const skewY = 0;

    return {
        x,
        y,
        scaleX: Math.abs(finalScaleX),
        scaleY: finalScaleY,
        rotation,
        skewX: isFinite(skewX) ? skewX : 0,
        skewY
    };
}

console.log('=== Debug Transform Test ===');

// Simulate a rotation of 45 degrees around center point
const anchorX = 500;
const anchorY = 500;
const rotation = Math.PI / 4; // 45 degrees
const scaleX = 1, scaleY = 1;
const skewX = 0, skewY = 0;

// Create the group transform matrix
const groupMatrix = createGroupTransformMatrix(anchorX, anchorY, scaleX, scaleY, rotation, skewX, skewY);
console.log('Group matrix:', groupMatrix);

// Test with a horizontal line (like the first loop in debug element)
console.log('\n--- Testing Horizontal Line ---');
const horizontalLine = {
    x: 100, y: 200,  // Start point
    deltaX: 50, deltaY: 0,  // Horizontal line, 50px long
    scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0
};

const hLineMatrix = composeTransformMatrix(horizontalLine);
const hResultMatrix = multiplyMatrices(groupMatrix, hLineMatrix);
const hTransforms = decomposeTransformMatrix(hResultMatrix);

console.log('Original line start:', horizontalLine.x, horizontalLine.y);
console.log('Original line end:', horizontalLine.x + horizontalLine.deltaX, horizontalLine.y + horizontalLine.deltaY);
console.log('Transformed position:', hTransforms.x, hTransforms.y);
console.log('Transformed scale:', hTransforms.scaleX, hTransforms.scaleY);
console.log('Transformed rotation:', hTransforms.rotation * 180 / Math.PI, 'degrees');
console.log('Transformed skew:', hTransforms.skewX * 180 / Math.PI, hTransforms.skewY * 180 / Math.PI, 'degrees');

// Test with a vertical line (like the second loop in debug element)
console.log('\n--- Testing Vertical Line ---');
const verticalLine = {
    x: 100, y: 200,  // Start point
    deltaX: 0, deltaY: 50,  // Vertical line, 50px long
    scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0
};

const vLineMatrix = composeTransformMatrix(verticalLine);
const vResultMatrix = multiplyMatrices(groupMatrix, vLineMatrix);
const vTransforms = decomposeTransformMatrix(vResultMatrix);

console.log('Original line start:', verticalLine.x, verticalLine.y);
console.log('Original line end:', verticalLine.x + verticalLine.deltaX, verticalLine.y + verticalLine.deltaY);
console.log('Transformed position:', vTransforms.x, vTransforms.y);
console.log('Transformed scale:', vTransforms.scaleX, vTransforms.scaleY);
console.log('Transformed rotation:', vTransforms.rotation * 180 / Math.PI, 'degrees');
console.log('Transformed skew:', vTransforms.skewX * 180 / Math.PI, vTransforms.skewY * 180 / Math.PI, 'degrees');

// Test with a rectangle 
console.log('\n--- Testing Rectangle ---');
const rectangle = {
    x: 100, y: 200,  // Top-left corner
    scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0
};

const rectMatrix = composeTransformMatrix(rectangle);
const rectResultMatrix = multiplyMatrices(groupMatrix, rectMatrix);
const rectTransforms = decomposeTransformMatrix(rectResultMatrix);

console.log('Original rectangle position:', rectangle.x, rectangle.y);
console.log('Transformed position:', rectTransforms.x, rectTransforms.y);
console.log('Transformed scale:', rectTransforms.scaleX, rectTransforms.scaleY);
console.log('Transformed rotation:', rectTransforms.rotation * 180 / Math.PI, 'degrees');
console.log('Transformed skew:', rectTransforms.skewX * 180 / Math.PI, rectTransforms.skewY * 180 / Math.PI, 'degrees');
