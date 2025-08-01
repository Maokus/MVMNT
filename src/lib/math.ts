// Mathematical utilities for 2D transformations and animations

// ==========================================
// 2D Affine Transformation Matrix Operations
// ==========================================

/**
 * Represents a 2D affine transformation matrix as [a, b, c, d, e, f]
 * Corresponding to:
 * | a  c  e |
 * | b  d  f |
 * | 0  0  1 |
 */
export type Matrix2D = [number, number, number, number, number, number];

/**
 * Transform properties that can be extracted from or composed into a matrix
 */
export interface TransformProperties {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number; // in radians
    skewX: number;    // in radians
    skewY: number;    // in radians
}

/**
 * Create an identity matrix
 */
export function createIdentityMatrix(): Matrix2D {
    return [1, 0, 0, 1, 0, 0];
}

/**
 * Create a translation matrix
 */
export function createTranslationMatrix(x: number, y: number): Matrix2D {
    return [1, 0, 0, 1, x, y];
}

/**
 * Create a scaling matrix
 */
export function createScaleMatrix(scaleX: number, scaleY: number): Matrix2D {
    return [scaleX, 0, 0, scaleY, 0, 0];
}

/**
 * Create a rotation matrix
 */
export function createRotationMatrix(angle: number): Matrix2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [cos, sin, -sin, cos, 0, 0];
}

/**
 * Create a skew matrix
 */
export function createSkewMatrix(skewX: number, skewY: number): Matrix2D {
    return [1, Math.tan(skewY), Math.tan(skewX), 1, 0, 0];
}

/**
 * Multiply two 2D transformation matrices
 * Result = a * b (applies b first, then a)
 */
export function multiplyMatrices(a: Matrix2D, b: Matrix2D): Matrix2D {
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

/**
 * Apply a transformation matrix to a point
 */
export function transformPoint(matrix: Matrix2D, x: number, y: number): { x: number, y: number } {
    const [a, b, c, d, e, f] = matrix;
    return {
        x: a * x + c * y + e,
        y: b * x + d * y + f
    };
}

/**
 * Compose a transformation matrix from individual transform properties
 * Order: scale → skew → rotate → translate (applied in reverse due to matrix multiplication)
 */
export function composeTransformMatrix(props: TransformProperties): Matrix2D {
    let matrix = createIdentityMatrix();
    
    // Apply transforms in reverse order due to matrix multiplication
    // The last operation applied becomes the first to take effect
    
    // 1. Translation (applied last, happens first)
    if (props.x !== 0 || props.y !== 0) {
        matrix = multiplyMatrices(createTranslationMatrix(props.x, props.y), matrix);
    }
    
    // 2. Rotation
    if (props.rotation !== 0) {
        matrix = multiplyMatrices(createRotationMatrix(props.rotation), matrix);
    }
    
    // 3. Skew
    if (props.skewX !== 0 || props.skewY !== 0) {
        matrix = multiplyMatrices(createSkewMatrix(props.skewX, props.skewY), matrix);
    }
    
    // 4. Scale (applied first, happens last)
    if (props.scaleX !== 1 || props.scaleY !== 1) {
        matrix = multiplyMatrices(createScaleMatrix(props.scaleX, props.scaleY), matrix);
    }
    
    return matrix;
}

/**
 * Create a group transformation matrix with anchor point support
 * Formula: T_anchor * R * Sk * S * T_anchor^-1
 */
export function createGroupTransformMatrix(
    anchorX: number, 
    anchorY: number,
    scaleX: number, 
    scaleY: number, 
    rotation: number, 
    skewX: number, 
    skewY: number
): Matrix2D {
    let matrix = createIdentityMatrix();
    
    // Step 1: Translate to anchor point (T_anchor^-1)
    matrix = multiplyMatrices(createTranslationMatrix(-anchorX, -anchorY), matrix);
    
    // Step 2: Apply scaling (S)
    if (scaleX !== 1 || scaleY !== 1) {
        matrix = multiplyMatrices(createScaleMatrix(scaleX, scaleY), matrix);
    }
    
    // Step 3: Apply skew (Sk)
    if (skewX !== 0 || skewY !== 0) {
        matrix = multiplyMatrices(createSkewMatrix(skewX, skewY), matrix);
    }
    
    // Step 4: Apply rotation (R)
    if (rotation !== 0) {
        matrix = multiplyMatrices(createRotationMatrix(rotation), matrix);
    }
    
    // Step 5: Translate back from anchor point (T_anchor)
    matrix = multiplyMatrices(createTranslationMatrix(anchorX, anchorY), matrix);
    
    return matrix;
}

/**
 * Decompose a 2D affine transformation matrix back into transform components
 * Uses a simplified approach that works well for most 2D graphics transformations
 */
export function decomposeTransformMatrix(matrix: Matrix2D): TransformProperties {
    const [a, b, c, d, e, f] = matrix;
    
    // Extract translation (straightforward)
    const x = e;
    const y = f;
    
    // For the 2x2 linear part [a c; b d], extract scale, rotation, and skew
    // Using a simplified approach that works well for typical graphics transformations
    
    // Calculate determinant to handle reflection
    const det = a * d - b * c;
    const sign = det < 0 ? -1 : 1;
    
    // Extract scale and rotation from the transformation
    // Method: Use the first column to determine scale and rotation
    const scaleX = sign * Math.sqrt(a * a + b * b);
    let scaleY = det / scaleX;
    
    // Extract rotation from the normalized first column
    const rotation = Math.atan2(b, a);
    
    // For skew extraction, we'll use a simplified approach
    // Remove the rotation and scale effects to isolate skew
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    
    // Apply inverse rotation to the second column
    const rotatedC = c * cos - d * sin;
    const rotatedD = c * sin + d * cos;
    
    // In an ideal case without skew, rotatedC should be 0 and rotatedD should be scaleY
    // The presence of rotatedC indicates skew
    const skewX = Math.atan2(rotatedC, Math.abs(scaleY));
    
    // Adjust scaleY to account for skew
    if (Math.abs(Math.cos(skewX)) > 0.001) {
        scaleY = rotatedD / Math.cos(skewX);
    }
    
    // For most 2D graphics applications, skewY is rarely used
    const skewY = 0;
    
    return {
        x,
        y,
        scaleX: Math.abs(scaleX),
        scaleY: Math.abs(scaleY),
        rotation,
        skewX: isFinite(skewX) ? skewX : 0,
        skewY
    };
}

/**
 * Validate that a matrix decomposition round-trip is accurate
 * Useful for debugging matrix operations
 */
export function validateMatrixRoundTrip(original: TransformProperties, tolerance: number = 0.001): boolean {
    const matrix = composeTransformMatrix(original);
    const decomposed = decomposeTransformMatrix(matrix);
    
    const checks = {
        x: Math.abs(decomposed.x - original.x) < tolerance,
        y: Math.abs(decomposed.y - original.y) < tolerance,
        scaleX: Math.abs(decomposed.scaleX - original.scaleX) < tolerance,
        scaleY: Math.abs(decomposed.scaleY - original.scaleY) < tolerance,
        rotation: Math.abs(decomposed.rotation - original.rotation) < tolerance,
        skewX: Math.abs(decomposed.skewX - original.skewX) < tolerance,
        skewY: Math.abs(decomposed.skewY - original.skewY) < tolerance
    };
    
    return Object.values(checks).every(check => check);
}

// ==========================================
// Easing Functions for Animations
// ==========================================

export const Easing = {
    /**
     * Quadratic ease-in-out
     */
    easeInOutQuad: (t: number): number => {
        return t < 0.5
            ? 2 * t * t
            : -1 + (4 - 2 * t) * t;
    },

    /**
     * Alias for easeInOutQuad
     */
    easeInOut: (t: number): number => {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    },

    /**
     * Quadratic ease-in
     */
    easeIn: (t: number): number => {
        return t * t;
    },

    /**
     * Quadratic ease-out
     */
    easeOut: (t: number): number => {
        return t * (2 - t);
    },

    /**
     * Linear interpolation (no easing)
     */
    linear: (t: number): number => {
        return t;
    },

    /**
     * Cubic ease-in-out
     */
    easeInOutCubic: (t: number): number => {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    /**
     * Elastic ease-out
     */
    easeOutElastic: (t: number): number => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0
            ? 0
            : t === 1
            ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    /**
     * Bounce ease-out
     */
    easeOutBounce: (t: number): number => {
        const n1 = 7.5625;
        const d1 = 2.75;

        if (t < 1 / d1) {
            return n1 * t * t;
        } else if (t < 2 / d1) {
            return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
            return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    }
};

// ==========================================
// Utility Functions
// ==========================================

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Convert degrees to radians
 */
export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

/**
 * Normalize an angle to be between -π and π
 */
export function normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}
