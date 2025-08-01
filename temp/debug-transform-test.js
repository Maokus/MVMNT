// Test to debug transform issues with Line vs Rectangle
import { createGroupTransformMatrix, multiplyMatrices, composeTransformMatrix, decomposeTransformMatrix } from './src/lib/math.ts';
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
    x: 100, y: 200,
    deltaX: 50, deltaY: 0,
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
    x: 100, y: 200,
    deltaX: 0, deltaY: 50,
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
    x: 100, y: 200,
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
