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
    const { translationX, translationY, rotation, scaleX, scaleY, pivotX, pivotY } = transform;
    const legacyUniformScale = transform.legacyUniformScale ?? 1;
    const legacyContentScaleX = transform.legacyContentScaleX ?? 1;
    const legacyContentScaleY = transform.legacyContentScaleY ?? 1;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const preX = scaleX * legacyUniformScale;
    const preY = scaleY * legacyUniformScale;
    const a = cosine * preX;
    const b = sine * preX;
    const c = -sine * preY;
    const d = cosine * preY;
    return [
        a * legacyContentScaleX,
        b * legacyContentScaleX,
        c * legacyContentScaleY,
        d * legacyContentScaleY,
        translationX + pivotX - a * pivotX - c * pivotY,
        translationY + pivotY - b * pivotX - d * pivotY,
    ];
}

/** Decompose a non-sheared affine matrix while retaining the authored pivot. */
export function matrixToNodeTransform(
    matrix: Matrix2D,
    pivotX: number,
    pivotY: number,
    compatibility?: NodeTransform
): NodeTransform | null {
    const legacyUniformScale = compatibility?.legacyUniformScale ?? 1;
    const legacyContentScaleX = compatibility?.legacyContentScaleX ?? 1;
    const legacyContentScaleY = compatibility?.legacyContentScaleY ?? 1;
    if (legacyUniformScale !== 1 || legacyContentScaleX !== 1 || legacyContentScaleY !== 1) {
        if (
            Math.abs(legacyUniformScale) <= MATRIX_EPSILON ||
            Math.abs(legacyContentScaleX) <= MATRIX_EPSILON ||
            Math.abs(legacyContentScaleY) <= MATRIX_EPSILON
        ) {
            return null;
        }
        const [a, b, c, d, e, f] = matrix;
        const decomposed = matrixToNodeTransform(
            [a / legacyContentScaleX, b / legacyContentScaleX, c / legacyContentScaleY, d / legacyContentScaleY, e, f],
            pivotX,
            pivotY
        );
        if (!decomposed) return null;
        return {
            ...decomposed,
            scaleX: decomposed.scaleX / legacyUniformScale,
            scaleY: decomposed.scaleY / legacyUniformScale,
            ...(compatibility?.legacyUniformScale !== undefined ? { legacyUniformScale } : {}),
            ...(compatibility?.legacyContentScaleX !== undefined ? { legacyContentScaleX } : {}),
            ...(compatibility?.legacyContentScaleY !== undefined ? { legacyContentScaleY } : {}),
        };
    }
    const [a, b, c, d, e, f] = matrix;
    const scaleX = Math.hypot(a, b);
    if (!Number.isFinite(scaleX) || scaleX <= MATRIX_EPSILON) return null;
    const rotation = Math.atan2(b, a);
    const determinant = a * d - b * c;
    const scaleY = determinant / scaleX;
    if (!Number.isFinite(scaleY) || Math.abs(scaleY) <= MATRIX_EPSILON) return null;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const tolerance = Math.max(1, scaleX, Math.abs(scaleY)) * 1e-7;
    if (Math.abs(c + sine * scaleY) > tolerance || Math.abs(d - cosine * scaleY) > tolerance) return null;
    const translationX = e - pivotX + a * pivotX + c * pivotY;
    const translationY = f - pivotY + b * pivotX + d * pivotY;
    const transform = { translationX, translationY, rotation, scaleX, scaleY, pivotX, pivotY };
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

export function scaleMatrix(scaleX: number, scaleY = scaleX): Matrix2D {
    return [scaleX, 0, 0, scaleY, 0, 0];
}

export function matrixAroundPoint(matrix: Matrix2D, x: number, y: number): Matrix2D {
    return multiplyMatrices(translationMatrix(x, y), multiplyMatrices(matrix, translationMatrix(-x, -y)));
}
