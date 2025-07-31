// Visualizer types for rendering and scene management

export interface RenderConfig {
  backgroundColor: string;
  resolution: number;
  fps: number;
  quality: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface SceneElement {
  id: string;
  type: string;
  enabled: boolean;
  position: Position;
  size: Size;
  config: { [key: string]: any };
  render(ctx: CanvasRenderingContext2D, time: number, data: any): void;
}

export interface RenderObject {
  type: string;
  position: Position;
  size: Size;
  color?: string;
  opacity?: number;
  render(ctx: CanvasRenderingContext2D): void;
}

export interface VisualizerConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  backgroundColor: string;
  scenes: SceneElement[];
}

export interface AnimationConfig {
  duration: number;
  easing: string;
  delay?: number;
}

export interface TimeUnitConfig {
  bars: number;
  beats: number;
  subdivision: number;
}
