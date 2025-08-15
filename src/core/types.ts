// Merged types for MIDI processing, timing management, and visualizer rendering

import { RenderObject } from '../visualizer/render-objects';

// ==========================================
// MIDI Processing and Core Types
// ==========================================

export interface MIDIEvent {
    type: 'noteOn' | 'noteOff' | 'controlChange' | 'programChange' | 'pitchBend' | 'meta';
    channel?: number;
    note?: number;
    velocity?: number;
    time: number;
    tick?: number; // original absolute tick (relative to trimmed start) when available
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
    trimmedTicks: number;
    // Optional tempo map with absolute times in seconds and tempo (microseconds per quarter)
    tempoMap?: Array<{ time: number; tempo: number }>;
    fileName?: string; // Optional file name for save/load functionality
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
    globalSkewX?: number;
    globalSkewY?: number;

    // Global visibility properties
    globalOpacity?: number;
}

export interface ConfigSchemaProperty {
    type: 'string' | 'number' | 'boolean' | 'color' | 'select' | 'range' | 'file' | 'file-midi' | 'file-image';
    label: string;
    default: any;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: any; label: string }>;
    accept?: string; // For file inputs
    description?: string;
}

export interface ConfigSchema {
    name: string;
    description: string;
    category: string;
    properties: { [key: string]: ConfigSchemaProperty };
}

// ==========================================
// New Grouped Schema Types (for AE-style UI)
// ==========================================

export interface PropertyDefinition {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'color' | 'select' | 'range' | 'file' | 'file-midi' | 'file-image' | 'font';
    label: string;
    default?: any;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: any; label: string }>;
    accept?: string; // For file inputs
    description?: string;
}

export interface PropertyGroup {
    id: string;
    label: string;
    collapsed: boolean;
    properties: PropertyDefinition[];
}

export interface EnhancedConfigSchema {
    name: string;
    description: string;
    category?: string;
    groups: PropertyGroup[];
}

export interface SceneElementInterface {
    type: string;
    id: string | null;
    visible: boolean;
    zIndex: number;

    // Element transform properties
    offsetX: number;
    offsetY: number;
    elementScaleX: number;
    elementScaleY: number;
    elementRotation: number;
    elementSkewX: number;
    elementSkewY: number;

    // Element visibility properties
    elementOpacity: number;

    buildRenderObjects(config: any, targetTime: number): RenderObject[];
    updateConfig(newConfig: { [key: string]: any }): void;
    setVisible(visible: boolean): this;
    setZIndex(zIndex: number): this;

    // Element transform methods
    setOffsetX(offsetX: number): this;
    setOffsetY(offsetY: number): this;
    setOffset(offsetX: number, offsetY: number): this;
    setElementScaleX(scaleX: number): this;
    setElementScaleY(scaleY: number): this;
    setElementScale(scaleX: number, scaleY?: number): this;
    setElementRotation(rotation: number): this;
    setElementRotationRadians(rotation: number): this;
    setElementSkewX(skewX: number): this;
    setElementSkewY(skewY: number): this;
    setElementSkew(skewX: number, skewY: number): this;
    setElementOpacity(opacity: number): this;
}

export interface BackgroundElementConfig extends BaseSceneElementConfig {
    backgroundColor?: string;
}

export interface TextOverlayElementConfig extends BaseSceneElementConfig {
    justification?: 'left' | 'center' | 'right';
    x?: number;
    y?: number;
    text?: string;
    fontFamily?: string; // may include weight as family|weight
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
