export const PERSPECTIVE_WARP_BINDING_DEFAULTS = {
    warpEnabled: false,
    warpTopLeftX: 0,
    warpTopLeftY: 0,
    warpTopRightX: 1,
    warpTopRightY: 0,
    warpBottomRightX: 1,
    warpBottomRightY: 1,
    warpBottomLeftX: 0,
    warpBottomLeftY: 1,
} as const;

export const PERSPECTIVE_WARP_CORNER_BINDINGS = {
    'warp-tl': ['warpTopLeftX', 'warpTopLeftY'],
    'warp-tr': ['warpTopRightX', 'warpTopRightY'],
    'warp-br': ['warpBottomRightX', 'warpBottomRightY'],
    'warp-bl': ['warpBottomLeftX', 'warpBottomLeftY'],
} as const;
