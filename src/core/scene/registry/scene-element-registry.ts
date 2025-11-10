/* Minimal typing (improve later) */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as elements from '@core/scene/elements';

export interface SceneElementFactorySchema {
    name?: string;
    description?: string;
    category?: string;
    properties?: Record<string, any>;
}

export type SceneElementFactory = (config?: any) => any;

interface RegisterableSceneElement {
    new (...args: any[]): elements.SceneElement;
    getConfigSchema(): SceneElementFactorySchema;
}

export class SceneElementRegistry {
    private factories = new Map<string, SceneElementFactory>();
    private schemas = new Map<string, SceneElementFactorySchema>();

    constructor() {
        this.registerDefaultElements();
    }

    registerElement(type: string, factory: SceneElementFactory, schema: SceneElementFactorySchema) {
        this.factories.set(type, factory);
        this.schemas.set(type, schema);
    }

    registerElementFromClass(type: string, ElementClass: RegisterableSceneElement) {
        if (typeof (ElementClass as any)?.getConfigSchema !== 'function') {
            console.error('[SceneElementRegistry] Missing getConfigSchema for', type, ElementClass);
        }
        this.registerElement(
            type,
            (config) => new ElementClass(config.id || type, config),
            ElementClass.getConfigSchema()
        );
    }

    createElement(type: string, config: any = {}) {
        const factory = this.factories.get(type);
        if (!factory) {
            console.warn(`Unknown scene element type: ${type}`);
            return null;
        }
        return factory(config);
    }

    getSchema(type: string) {
        return this.schemas.get(type) || null;
    }

    getAvailableTypes() {
        return Array.from(this.factories.keys());
    }

    getElementTypeInfo() {
        return this.getAvailableTypes().map((type) => {
            const schema = this.getSchema(type);
            return {
                type,
                name: schema?.name || type,
                description: schema?.description || `${type} element`,
                category: schema?.category || 'general',
            };
        });
    }

    private registerDefaultElements() {
        this.registerElementFromClass('timeUnitPianoRoll', elements.TimeUnitPianoRollElement);
        this.registerElementFromClass('movingNotesPianoRoll', elements.MovingNotesPianoRollElement);
        this.registerElementFromClass('background', elements.BackgroundElement);
        this.registerElementFromClass('image', elements.ImageElement);
        this.registerElementFromClass('progressDisplay', elements.ProgressDisplayElement);
        this.registerElementFromClass('textOverlay', elements.TextOverlayElement);
        this.registerElementFromClass('timeDisplay', elements.TimeDisplayElement);
        this.registerElementFromClass('debug', elements.DebugElement);
        this.registerElementFromClass('notesPlayedTracker', elements.NotesPlayedTrackerElement);
        this.registerElementFromClass('notesPlayingDisplay', elements.NotesPlayingDisplayElement);
        this.registerElementFromClass('chordEstimateDisplay', elements.ChordEstimateDisplayElement);
        this.registerElementFromClass('audioSpectrum', elements.AudioSpectrumElement);
        this.registerElementFromClass('audioVolumeMeter', elements.AudioVolumeMeterElement);
        this.registerElementFromClass('audioWaveform', elements.AudioWaveformElement);
        this.registerElementFromClass('audioLockedOscilloscope', elements.AudioLockedOscilloscopeElement);
        this.registerElementFromClass('audioMinimal', elements.AudioMinimalElement);
        this.registerElementFromClass('audioOddProfile', elements.AudioOddProfileElement);
        this.registerElementFromClass('audioAdhocProfile', elements.AudioAdhocProfileElement);
        this.registerElementFromClass('audioBadReq', elements.AudioBadReqElement);
        this.registerElementFromClass('audioDebug', elements.AudioDebugElement);
    }
}

export const sceneElementRegistry = new SceneElementRegistry();
