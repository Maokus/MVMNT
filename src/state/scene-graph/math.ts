import type { Matrix2D, NodeTransform } from './types';
import { IDENTITY_MATRIX } from './types';

export const MATRIX_EPSILON = 1e-10;

export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
    const [a, b, c, d, e, f] = left;
    const [g, h, i, j, k, l] = right;
    return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

export function invertMatrix(matrix: Matrix2D): Matrix2D | null {
    const [a, b, c, d, e, f] = matrix;
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= MATRIX_EPSILON) return null;
    return [
        d / determinant,
        -b / determinant,
        -c / determinant,
        a / determinant,
        (c * f - d * e) / determinant,
        (b * e - a * f) / determinant,
    ];
}

export function nodeTransformToMatrix(transform: NodeTransform): Matrix2D {
    const { translationX, translationY, rotation, uniformScale, pivotX, pivotY } = transform;
    const cosine = Math.cos(rotation) * uniformScale;
    const sine = Math.sin(rotation) * uniformScale;
    return [
        cosine,
        sine,
        -sine,
        cosine,
        translationX + pivotX - cosine * pivotX + sine * pivotY,
        translationY + pivotY - sine * pivotX - cosine * pivotY,
    ];
}

/** Decompose a non-reflecting similarity matrix while retaining the authored pivot. */
export function matrixToNodeTransform(matrix: Matrix2D, pivotX: number, pivotY: number): NodeTransform | null {
    const [a, b, c, d, e, f] = matrix;
    const uniformScale = Math.hypot(a, b);
    if (!Number.isFinite(uniformScale) || uniformScale <= MATRIX_EPSILON) return null;
    const rotation = Math.atan2(b, a);
    const cosine = Math.cos(rotation) * uniformScale;
    const sine = Math.sin(rotation) * uniformScale;
    const tolerance = Math.max(1, uniformScale) * 1e-7;
    if (Math.abs(c + sine) > tolerance || Math.abs(d - cosine) > tolerance) return null;
    const translationX = e - pivotX + cosine * pivotX - sine * pivotY;
    const translationY = f - pivotY + sine * pivotX + cosine * pivotY;
    const transform = { translationX, translationY, rotation, uniformScale, pivotX, pivotY };
    return Object.values(transform).every(Number.isFinite) ? transform : null;
}

export function applyMatrixToPoint(matrix: Matrix2D, point: { x: number; y: number }) {
    return {
        x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
        y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
    };
}

export function isFiniteMatrix(matrix: unknown): matrix is Matrix2D {
    return (
        Array.isArray(matrix) &&
        matrix.length === 6 &&
        matrix.every((value) => typeof value === 'number' && Number.isFinite(value))
    );
}

export function matricesEqual(left: Matrix2D, right: Matrix2D, epsilon = MATRIX_EPSILON): boolean {
    return left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
}

export function identityMatrix(): Matrix2D {
    return [...IDENTITY_MATRIX];
}

export function translationMatrix(x: number, y: number): Matrix2D {
    return [1, 0, 0, 1, x, y];
}

export function rotationMatrix(radians: number): Matrix2D {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return [cosine, sine, -sine, cosine, 0, 0];
}

export function scaleMatrix(scale: number): Matrix2D {
    return [scale, 0, 0, scale, 0, 0];
}

export function matrixAroundPoint(matrix: Matrix2D, x: number, y: number): Matrix2D {
    return multiplyMatrices(translationMatrix(x, y), multiplyMatrices(matrix, translationMatrix(-x, -y)));
}
