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

export declare abstract class RenderObject {
    [key: string]: any;
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class BoxRenderObject extends RenderObject {
    constructor(...args: any[]);
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class EmptyRenderObject extends RenderObject {
    constructor(...args: any[]);
    addChild(child: RenderObject): this;
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export interface FillStyle {
    readonly [key: string]: unknown;
    readonly fillColor?: string | null;
    readonly opacity?: number;
}

export declare class Rectangle extends RenderObject {
    width: number;
    height: number;
    constructor(...args: any[]);
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Text extends RenderObject {
    constructor(...args: any[]);
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Line extends RenderObject {
    constructor(...args: any[]);
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Arc extends RenderObject {
    constructor(...args: any[]);
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Poly extends RenderObject {
    constructor(...args: any[]);
}
export declare class BezierPath extends RenderObject {
    constructor(...args: any[]);
}
export declare class GlowLayer extends RenderObject {
    constructor(...args: any[]);
    addChild(child: RenderObject): this;
}
export declare class CompositeLayer extends RenderObject {
    constructor(...args: any[]);
    addChild(child: RenderObject): this;
}
export declare class ClipLayer extends RenderObject {
    constructor(...args: any[]);
    addChild(child: RenderObject): this;
}
export declare class VisualMedia extends RenderObject {
    constructor(...args: any[]);
    setResource(resource: unknown | null, status?: 'idle' | 'loading' | 'ready' | 'error'): this;
    setLocalTime(seconds: number): this;
    setAnimation(name: string | null): this;
    setFitMode(mode: 'contain' | 'cover' | 'fill' | 'clip'): this;
    setDimensions(width: number, height: number): this;
    setLayoutParticipation(value: 'include' | 'exclude'): this;
}
export declare class PixelGrid extends RenderObject {
    constructor(...args: any[]);
}

export interface FramePlacementCustom {
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
}
export type FramePlacementPreset = 'contain' | 'cover' | 'stretch' | 'center';
export type FramePlacement = FramePlacementPreset | FramePlacementCustom;
export interface VisualMediaOptions extends Readonly<Record<string, unknown>> {}
export interface RenderConfig extends Readonly<Record<string, unknown>> {}
