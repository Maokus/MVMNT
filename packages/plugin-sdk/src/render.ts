export interface RenderTime {
  readonly seconds: number;
  readonly beats: number | null;
  readonly ticks: number | null;
  readonly frame: number | null;
}

export declare abstract class RenderObject {
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class BoxRenderObject implements RenderObject {
  constructor(...args: any[]);
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class EmptyRenderObject implements RenderObject {
  constructor(...args: any[]);
  addChild(child: RenderObject): this;
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export interface FillStyle { readonly fillColor?: string; readonly opacity?: number }

export declare class Rectangle implements RenderObject {
  constructor(x: number, y: number, width: number, height: number, style?: FillStyle);
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Text implements RenderObject {
  constructor(text: string, x: number, y: number, options?: Readonly<Record<string, unknown>>);
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Line implements RenderObject {
  constructor(x1: number, y1: number, x2: number, y2: number, options?: Readonly<Record<string, unknown>>);
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Arc implements RenderObject {
  constructor(x: number, y: number, radius: number, startAngle: number, endAngle: number, options?: Readonly<Record<string, unknown>>);
  setLayoutParticipation(value: 'include' | 'exclude'): this;
}

export declare class Poly implements RenderObject { constructor(...args: any[]); setLayoutParticipation(value: 'include' | 'exclude'): this }
export declare class BezierPath implements RenderObject { constructor(...args: any[]); setLayoutParticipation(value: 'include' | 'exclude'): this }
export declare class GlowLayer implements RenderObject { constructor(...args: any[]); addChild(child: RenderObject): this; setLayoutParticipation(value: 'include' | 'exclude'): this }
export declare class CompositeLayer implements RenderObject { constructor(...args: any[]); addChild(child: RenderObject): this; setLayoutParticipation(value: 'include' | 'exclude'): this }
export declare class ClipLayer implements RenderObject { constructor(...args: any[]); addChild(child: RenderObject): this; setLayoutParticipation(value: 'include' | 'exclude'): this }
export declare class VisualMedia implements RenderObject { constructor(...args: any[]); setLayoutParticipation(value: 'include' | 'exclude'): this }
export declare class PixelGrid implements RenderObject { constructor(...args: any[]); setLayoutParticipation(value: 'include' | 'exclude'): this }

export interface FramePlacementCustom { readonly x: number; readonly y: number; readonly width?: number; readonly height?: number }
export type FramePlacementPreset = 'contain' | 'cover' | 'stretch' | 'center';
export type FramePlacement = FramePlacementPreset | FramePlacementCustom;
export interface VisualMediaOptions extends Readonly<Record<string, unknown>> {}
export interface RenderConfig extends Readonly<Record<string, unknown>> {}
