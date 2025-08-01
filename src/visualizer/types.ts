// Merged types for MIDI processing, timing management, and visualizer rendering

// ==========================================
// MIDI Processing and Core Types
// ==========================================

export interface MIDIEvent {
  type: 'noteOn' | 'noteOff' | 'controlChange' | 'programChange' | 'pitchBend' | 'meta';
  channel?: number;
  note?: number;
  velocity?: number;
  time: number;
  duration?: number;
  data?: number[];
  metaType?: number;
  text?: string;
}

export interface MIDITimeSignature {
  numerator: number;
  denominator: number;
  clocksPerClick: number;
  thirtysecondNotesPerBeat: number;
}

export interface MIDIData {
  events: MIDIEvent[];
  duration: number;
  tempo: number;
  ticksPerQuarter: number;
  timeSignature: MIDITimeSignature;
  timingManager?: any; // Keep as any for now since TimingManager is still JS
  trimmedTicks: number;
}

export interface TimingData {
  currentTime: number;
  totalTime: number;
  progress: number;
  isPlaying: boolean;
}

export interface NoteBlock {
  note: number;
  velocity: number;
  startTime: number;
  endTime: number;
  duration: number;
  channel: number;
}

export interface ProgressCallback {
  onProgress?: (progress: number, text: string) => void;
}

export interface ExportOptions extends ProgressCallback {
  resolution?: number;
  fps?: number;
  fullDuration?: boolean;
  format?: 'webm' | 'gif' | 'images';
}

export interface TimingManager {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  totalDuration: number;
  start(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  getCurrentTime(): number;
  getTotalDuration(): number;
}

export interface Manager {
  noteBlocks: NoteBlock[];
  midiData: MIDIData | null;
  timingManager: TimingManager | null;
  addNoteBlock(noteBlock: NoteBlock): void;
  removeNoteBlock(noteBlock: NoteBlock): void;
  getActiveNotes(time: number): NoteBlock[];
  reset(): void;
}

// ==========================================
// Visualizer and Rendering Types
// ==========================================

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

export interface SceneElementConfig {
  id: string;
  type: string;
  enabled: boolean;
  position: Position;
  size: Size;
  config: { [key: string]: any };
  render(ctx: CanvasRenderingContext2D, time: number, data: any): void;
}

export interface RenderObjectConfig {
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
  scenes: SceneElementConfig[];
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

// ==========================================
// Scene Element Types
// ==========================================

export interface RenderObjectInterface {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  rotation: number;
  
  // Anchor points for transformations
  anchorX: number;
  anchorY: number;
  
  // Global transform properties
  globalOffsetX: number;
  globalOffsetY: number;
  globalScaleX: number;
  globalScaleY: number;
  globalRotation: number;
  globalOpacity: number;
  globalAnchorX: number;
  globalAnchorY: number;
  
  render(ctx: CanvasRenderingContext2D, config: any, currentTime: number): void;
  setGlobalTransform(offsetX: number, offsetY: number, scaleX: number, scaleY: number, rotation: number, opacity: number, anchorX: number, anchorY: number): any;
  setAnchor(anchorX: number, anchorY: number): any;
  getBounds(): { x: number; y: number; width: number; height: number };
}

export interface BaseSceneElementConfig {
  id?: string;
  visible?: boolean;
  zIndex?: number;
  
  // Global transform properties
  offsetX?: number;
  offsetY?: number;
  globalScaleX?: number;
  globalScaleY?: number;
  globalRotation?: number;
  
  // Global visibility properties
  globalOpacity?: number;
  
  // Anchor point properties
  anchorX?: number;
  anchorY?: number;
}

export interface ConfigSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'color' | 'select' | 'range';
  label: string;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: any; label: string }>;
  description?: string;
}

export interface ConfigSchema {
  name: string;
  description: string;
  category: string;
  properties: { [key: string]: ConfigSchemaProperty };
}

export interface SceneElementInterface {
  type: string;
  id: string | null;
  visible: boolean;
  zIndex: number;
  
  // Global transform properties
  offsetX: number;
  offsetY: number;
  globalScaleX: number;
  globalScaleY: number;
  globalRotation: number;
  
  // Global visibility properties
  globalOpacity: number;
  
  // Anchor point properties
  anchorX: number;
  anchorY: number;
  
  config: { [key: string]: any };
  
  buildRenderObjects(config: any, targetTime: number): RenderObjectInterface[];
  updateConfig(newConfig: { [key: string]: any }): void;
  getConfig(): { [key: string]: any };
  setVisible(visible: boolean): this;
  setZIndex(zIndex: number): this;
  
  // Global transform methods
  setOffsetX(offsetX: number): this;
  setOffsetY(offsetY: number): this;
  setOffset(offsetX: number, offsetY: number): this;
  setGlobalScaleX(scaleX: number): this;
  setGlobalScaleY(scaleY: number): this;
  setGlobalScale(scaleX: number, scaleY?: number): this;
  setGlobalRotation(rotation: number): this;
  setGlobalRotationRadians(rotation: number): this;
  
  // Global visibility methods
  setGlobalOpacity(opacity: number): this;
  
  // Anchor point methods
  setAnchorX(anchorX: number): this;
  setAnchorY(anchorY: number): this;
  setAnchor(anchorX: number, anchorY: number): this;
}

export interface BackgroundElementConfig extends BaseSceneElementConfig {
  backgroundColor?: string;
}

export interface TextOverlayElementConfig extends BaseSceneElementConfig {
  justification?: 'left' | 'center' | 'right';
  x?: number;
  y?: number;
  text?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: number;
  color?: string;
}

export interface ImageElementConfig extends BaseSceneElementConfig {
  src?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
}

export interface ProgressDisplayConfig extends BaseSceneElementConfig {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export interface TimeDisplayConfig extends BaseSceneElementConfig {
  x?: number;
  y?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  format?: 'mm:ss' | 'hh:mm:ss' | 'seconds';
}
