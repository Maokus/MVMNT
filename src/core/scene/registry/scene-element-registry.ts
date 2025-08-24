/* Phase 1 TS migration - minimal typing */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    TimeUnitPianoRollElement,
    MovingNotesPianoRollElement,
    BackgroundElement,
    ImageElement,
    ProgressDisplayElement,
    TextOverlayElement,
    TimeDisplayElement,
    DebugElement,
} from '@core/scene/elements';

export interface SceneElementFactorySchema {
    name?: string;
    description?: string;
    category?: string;
    properties?: Record<string, any>;
}

export type SceneElementFactory = (config?: any) => any;

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
        this.registerElement(
            'timeUnitPianoRoll',
            (config) => new TimeUnitPianoRollElement(config.id || 'timeUnitPianoRoll', config),
            TimeUnitPianoRollElement.getConfigSchema()
        );
        this.registerElement(
            'movingNotesPianoRoll',
            (config) => new MovingNotesPianoRollElement(config.id || 'movingNotesPianoRoll', config),
            MovingNotesPianoRollElement.getConfigSchema()
        );
        this.registerElement(
            'background',
            (config) => new BackgroundElement(config.id || 'background', config),
            BackgroundElement.getConfigSchema()
        );
        this.registerElement(
            'image',
            (config) => new ImageElement(config.id || 'image', config),
            ImageElement.getConfigSchema()
        );
        this.registerElement(
            'progressDisplay',
            (config) => new ProgressDisplayElement(config.id || 'progressDisplay', config),
            ProgressDisplayElement.getConfigSchema()
        );
        this.registerElement(
            'textOverlay',
            (config) => new TextOverlayElement(config.id || 'textOverlay', config),
            TextOverlayElement.getConfigSchema()
        );
        this.registerElement(
            'timeDisplay',
            (config) => new TimeDisplayElement(config.id || 'timeDisplay', config),
            TimeDisplayElement.getConfigSchema()
        );
        this.registerElement(
            'debug',
            (config) => new DebugElement(config.id || 'debug', config),
            DebugElement.getConfigSchema()
        );
    }
}

export const sceneElementRegistry = new SceneElementRegistry();
