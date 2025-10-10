export interface Matrix3 {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
}

export interface MutableMatrix3 extends Matrix3 {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

export const IDENTITY_MATRIX: Matrix3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiplyMatrices(left: Matrix3, right: Matrix3): Matrix3 {
    return {
        a: left.a * right.a + left.c * right.b,
        b: left.b * right.a + left.d * right.b,
        c: left.a * right.c + left.c * right.d,
        d: left.b * right.c + left.d * right.d,
        e: left.a * right.e + left.c * right.f + left.e,
        f: left.b * right.e + left.d * right.f + left.f,
    };
}

export function applyMatrix(matrix: Matrix3, x: number, y: number): { x: number; y: number } {
    return {
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
    };
}

export function matrixFromTransform(
    x: number,
    y: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
    skewX: number,
    skewY: number
): Matrix3 {
    const sin = Math.sin(rotation);
    const cos = Math.cos(rotation);
    const tanX = Math.tan(skewX);
    const tanY = Math.tan(skewY);

    const translate: Matrix3 = { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
    const rotate: Matrix3 = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
    const scale: Matrix3 = { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 };
    const skew: Matrix3 = { a: 1, b: tanY, c: tanX, d: 1, e: 0, f: 0 };

    return multiplyMatrices(multiplyMatrices(multiplyMatrices(translate, rotate), scale), skew);
}

export function extractScaleMagnitude(matrix: Matrix3): number {
    const sx = Math.hypot(matrix.a, matrix.b);
    const sy = Math.hypot(matrix.c, matrix.d);
    return (sx + sy) / 2;
}

export function multiplyInto(target: MutableMatrix3, other: Matrix3): void {
    const a = target.a * other.a + target.c * other.b;
    const b = target.b * other.a + target.d * other.b;
    const c = target.a * other.c + target.c * other.d;
    const d = target.b * other.c + target.d * other.d;
    const e = target.a * other.e + target.c * other.f + target.e;
    const f = target.b * other.e + target.d * other.f + target.f;
    target.a = a;
    target.b = b;
    target.c = c;
    target.d = d;
    target.e = e;
    target.f = f;
}

export function invertMatrix(matrix: Matrix3): Matrix3 | null {
    const det = matrix.a * matrix.d - matrix.b * matrix.c;
    if (Math.abs(det) < 1e-8) return null;
    const invDet = 1 / det;
    const a = matrix.d * invDet;
    const b = -matrix.b * invDet;
    const c = -matrix.c * invDet;
    const d = matrix.a * invDet;
    const e = -(a * matrix.e + c * matrix.f);
    const f = -(b * matrix.e + d * matrix.f);
    return { a, b, c, d, e, f };
}

export function transformBoundingBox(
    matrix: Matrix3,
    x: number,
    y: number,
    width: number,
    height: number
): { minX: number; minY: number; maxX: number; maxY: number } {
    const p1 = applyMatrix(matrix, x, y);
    const p2 = applyMatrix(matrix, x + width, y);
    const p3 = applyMatrix(matrix, x + width, y + height);
    const p4 = applyMatrix(matrix, x, y + height);
    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
    return { minX, minY, maxX, maxY };
}

export function matrixEquals(a: Matrix3, b: Matrix3, epsilon = 1e-6): boolean {
    return (
        Math.abs(a.a - b.a) <= epsilon &&
        Math.abs(a.b - b.b) <= epsilon &&
        Math.abs(a.c - b.c) <= epsilon &&
        Math.abs(a.d - b.d) <= epsilon &&
        Math.abs(a.e - b.e) <= epsilon &&
        Math.abs(a.f - b.f) <= epsilon
    );
}
