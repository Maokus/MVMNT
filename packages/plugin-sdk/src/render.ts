export interface RenderTime {
    readonly seconds: number;
    readonly beats: number | null;
    readonly ticks: number | null;
    readonly frame: number | null;
    readonly viewport?: Readonly<{ width: number; height: number }>;
    readonly durationSeconds?: number;
    readonly playbackStartSeconds?: number;
    readonly playbackEndSeconds?: number;
}

export type LayoutParticipation = 'auto' | 'include' | 'exclude';

export interface RenderObjectOptions {
    readonly layoutParticipation?: LayoutParticipation;
    readonly originX?: number;
    readonly originY?: number;
}

export declare abstract class RenderObject {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
    opacity: number;
    visible: boolean;
    rotation: number;
    originX: number;
    originY: number;
    layoutParticipation: LayoutParticipation;
    blendMode: GlobalCompositeOperation | null;
    filter: string | null;
    readonly children: RenderObject[];
    protected constructor(
        x?: number,
        y?: number,
        scaleX?: number,
        scaleY?: number,
        opacity?: number,
        options?: RenderObjectOptions
    );
    setOrigin(x: number, y: number): this;
    setOriginFraction(x: number, y: number): this;
    setOpacity(alpha: number): this;
    setLayoutParticipation(value: LayoutParticipation): this;
    setBlendMode(mode: GlobalCompositeOperation | null): this;
    setFilter(filter: string | null): this;
    setPosition(x: number, y: number): this;
    setScale(x: number, y?: number): this;
    setRotation(radians: number): this;
    setSkew(x: number, y: number): this;
    setVisible(visible: boolean): this;
    addChild(child: RenderObject | null | undefined): this;
    addChildren(children: readonly (RenderObject | null | undefined)[]): this;
    removeChild(child: RenderObject): this;
    getChildren(): RenderObject[];
    clearChildren(): this;
}

export declare abstract class BoxRenderObject extends RenderObject {
    width: number;
    height: number;
    constructor(
        x: number,
        y: number,
        width: number,
        height: number,
        options?: Pick<RenderObjectOptions, 'layoutParticipation'>
    );
    setSize(width: number, height: number): this;
}

export declare class EmptyRenderObject extends RenderObject {
    constructor(
        x?: number,
        y?: number,
        scaleX?: number,
        scaleY?: number,
        opacity?: number,
        options?: Pick<RenderObjectOptions, 'layoutParticipation'>
    );
}

export interface FillStyle {
    readonly fillColor?: string | null;
    readonly opacity?: number;
}

export interface RectangleOptions extends RenderObjectOptions {
    readonly fillColor?: string | null;
    readonly strokeColor?: string | null;
    readonly strokeWidth?: number;
    readonly cornerRadius?: number;
    readonly lineDash?: number[];
    readonly lineDashOffset?: number;
    readonly shadowColor?: string | null;
    readonly shadowBlur?: number;
    readonly shadowOffsetX?: number;
    readonly shadowOffsetY?: number;
}

export declare class Rectangle extends BoxRenderObject {
    fillColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    cornerRadius: number;
    constructor(x: number, y: number, width: number, height: number, options?: RectangleOptions);
    setFill(color: string | null): this;
    setStroke(color: string | null, width?: number): this;
    setCornerRadius(radius: number): this;
}

export interface TextOptions extends RenderObjectOptions {
    readonly color?: string;
    readonly align?: CanvasTextAlign;
    readonly baseline?: CanvasTextBaseline;
    readonly strokeColor?: string | null;
    readonly strokeWidth?: number;
    readonly maxWidth?: number | null;
    readonly letterSpacing?: number;
    readonly shadow?: Readonly<{ color: string; blur: number; offsetX: number; offsetY: number }> | null;
}

export declare class Text extends RenderObject {
    text: string;
    font: string;
    color: string;
    constructor(x: number, y: number, text: string, font?: string, options?: TextOptions);
    setText(text: string): this;
    setFont(font: string): this;
    setColor(color: string): this;
    setFill(color: string): this;
    setAlignment(align: CanvasTextAlign, baseline?: CanvasTextBaseline): this;
    setStroke(color: string | null, width: number): this;
}

export interface LineOptions extends RenderObjectOptions {
    readonly color?: string;
    readonly lineWidth?: number;
    readonly lineCap?: CanvasLineCap;
    readonly lineDash?: number[];
    readonly lineDashOffset?: number;
    readonly shadowColor?: string | null;
    readonly shadowBlur?: number;
    readonly shadowOffsetX?: number;
    readonly shadowOffsetY?: number;
}

export declare class Line extends RenderObject {
    color: string;
    lineWidth: number;
    lineCap: CanvasLineCap;
    constructor(x1: number, y1: number, x2: number, y2: number, options?: LineOptions);
    setColor(color: string): this;
    setStroke(color: string, width?: number): this;
    setLineWidth(width: number): this;
    setLineCap(cap: CanvasLineCap): this;
}

export interface ArcOptions extends RenderObjectOptions {
    readonly startAngle?: number;
    readonly endAngle?: number;
    readonly anticlockwise?: boolean;
    readonly fillColor?: string | null;
    readonly strokeColor?: string | null;
    readonly strokeWidth?: number;
    readonly fillRule?: CanvasFillRule;
}

export declare class Arc extends RenderObject {
    radius: number;
    startAngle: number;
    endAngle: number;
    anticlockwise: boolean;
    fillColor: string | null;
    strokeColor: string | null;
    strokeWidth: number;
    arcFillStyle: 'segment' | 'sector';
    constructor(x: number, y: number, radius: number, options?: ArcOptions);
    setRadius(radius: number): this;
    setAngles(start: number, end: number, anticlockwise?: boolean): this;
    setFill(color: string | null): this;
    setStroke(color: string | null, width?: number): this;
    setLineCap(cap: CanvasLineCap): this;
}

export interface PolyOptions extends RenderObjectOptions {
    readonly fillColor?: string | null;
    readonly strokeColor?: string | null;
    readonly strokeWidth?: number;
}

export declare class Poly extends RenderObject {
    constructor(points?: unknown, options?: PolyOptions);
    setPoints(points: unknown): this;
    setFill(color: string | null): this;
    setStroke(color: string | null, width?: number): this;
    setClosed(closed: boolean): this;
    setLineJoin(join: CanvasLineJoin): this;
    setLineCap(cap: CanvasLineCap): this;
}

export type BezierPathCommand =
    | { type: 'moveTo'; x: number; y: number }
    | { type: 'lineTo'; x: number; y: number }
    | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
    | { type: 'bezierCurveTo'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
    | { type: 'closePath' };

export interface BezierPathOptions extends RenderObjectOptions {
    readonly fillColor?: string | null;
    readonly strokeColor?: string | null;
    readonly strokeWidth?: number;
    readonly fillRule?: CanvasFillRule;
}

export declare class BezierPath extends RenderObject {
    constructor(x?: number, y?: number, commands?: BezierPathCommand[], options?: BezierPathOptions);
    setFill(color: string | null): this;
    setStroke(color: string | null, width?: number): this;
}

export interface GlowLayerOptions {
    readonly glowBlur?: number;
    readonly glowOpacity?: number;
    readonly glowBlendMode?: GlobalCompositeOperation;
    readonly glowResolution?: number;
}
export declare class GlowLayer extends EmptyRenderObject {
    constructor(options?: GlowLayerOptions);
}
export declare class CompositeLayer extends EmptyRenderObject {
    constructor(layerBlendMode?: GlobalCompositeOperation, options?: Pick<RenderObjectOptions, 'layoutParticipation'>);
    setLayerBlendMode(mode: GlobalCompositeOperation): this;
}
export declare class ClipLayer extends EmptyRenderObject {
    constructor(clipWidth: number, clipHeight: number, options?: Pick<RenderObjectOptions, 'layoutParticipation'>);
    setClipSize(width: number, height: number): this;
}

export type FramePlacementPreset =
    | 'center'
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'center-left'
    | 'center-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right';
export interface FramePlacementCustom {
    readonly container: [number, number];
    readonly frame: [number, number];
}
export type FramePlacement = FramePlacementPreset | FramePlacementCustom;
export type SelfBoundsMode = 'drawn' | 'container';
export interface VisualMediaOptions extends RenderObjectOptions {
    readonly fitMode?: 'contain' | 'cover' | 'fill' | 'clip';
    readonly preserveAspectRatio?: boolean;
    readonly selfBoundsMode?: SelfBoundsMode;
    readonly framePlacement?: FramePlacement;
    readonly showDebug?: boolean;
}
export declare class VisualMedia extends BoxRenderObject {
    constructor(x: number, y: number, width: number, height: number, options?: VisualMediaOptions);
    setResource(resource: unknown | null, status?: 'idle' | 'loading' | 'ready' | 'error'): this;
    setLocalTime(seconds: number): this;
    setAnimation(name: string | null): this;
    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'clip'): this;
    setDimensions(width: number, height: number): this;
    setFramePlacement(placement: FramePlacement): this;
    setSelfBoundsMode(mode: SelfBoundsMode): this;
}

export interface PixelGridOptions extends RenderObjectOptions {
    readonly pixels?: Uint8ClampedArray;
}
export declare class PixelGrid extends BoxRenderObject {
    constructor(x: number, y: number, cols: number, rows: number, cellSize: number, options?: PixelGridOptions);
    updatePixels(pixels: Uint8ClampedArray): void;
}

export interface RenderConfig extends Readonly<Record<string, unknown>> {}
