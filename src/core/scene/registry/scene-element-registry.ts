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

export interface RegisterCustomElementOptions {
    pluginId?: string;
    overrideCategory?: string;
}

export class SceneElementRegistry {
    private factories = new Map<string, SceneElementFactory>();
    private schemas = new Map<string, SceneElementFactorySchema>();
    private builtInTypes = new Set<string>();
    private pluginTypes = new Map<string, string>(); // type -> pluginId

    constructor() {
        this.registerDefaultElements();
    }

    /**
     * Register a built-in element (internal use)
     */
    registerElement(type: string, factory: SceneElementFactory, schema: SceneElementFactorySchema) {
        this.factories.set(type, factory);
        this.schemas.set(type, schema);
        this.builtInTypes.add(type);
    }

    /**
     * Register a built-in element from a class (internal use)
     */
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

    /**
     * Register a custom element from a plugin.
     *
     * Plugin elements are stored under a composite key `${pluginId}:${type}` so that
     * two different plugins can define elements with the same bare type name without
     * colliding. The element instance's `type` property is also set to this composite
     * key so that scene serialization stores the fully-qualified type.
     *
     * @returns The actual registry key used (composite for plugin elements, bare for others).
     * @throws {Error} if element type conflicts with a built-in element or class is invalid.
     */
    registerCustomElement(
        type: string,
        ElementClass: RegisterableSceneElement,
        options: RegisterCustomElementOptions = {}
    ): string {
        // Validate type
        if (!type || typeof type !== 'string') {
            throw new Error(`Invalid element type: ${type}`);
        }

        // Check for conflicts with built-in elements
        if (this.builtInTypes.has(type)) {
            throw new Error(`Cannot register custom element '${type}': conflicts with built-in element`);
        }

        // Validate class has required methods
        if (typeof (ElementClass as any)?.getConfigSchema !== 'function') {
            throw new Error(`Custom element class for '${type}' must have static getConfigSchema() method`);
        }

        // Plugin elements use a composite key to avoid cross-plugin collisions.
        const registryKey = options.pluginId ? `${options.pluginId}:${type}` : type;

        // Get base schema from class
        const baseSchema = ElementClass.getConfigSchema();
        const schema = {
            ...baseSchema,
            category: options.overrideCategory ?? baseSchema.category,
        };

        // Register factory. Override element.type so the serialized scene stores the composite key.
        const factory: SceneElementFactory = (config) => {
            const el = new ElementClass(config.id || type, config);
            if (options.pluginId) {
                (el as any).type = registryKey;
            }
            return el;
        };
        this.factories.set(registryKey, factory);
        this.schemas.set(registryKey, schema);

        // Track as plugin element
        if (options.pluginId) {
            this.pluginTypes.set(registryKey, options.pluginId);
        }

        return registryKey;
    }

    /**
     * Unregister a custom element
     * @throws {Error} if attempting to unregister a built-in element
     */
    unregisterElement(type: string): boolean {
        if (this.builtInTypes.has(type)) {
            throw new Error(`Cannot unregister built-in element '${type}'`);
        }

        const hadFactory = this.factories.delete(type);
        this.schemas.delete(type);
        this.pluginTypes.delete(type);
        return hadFactory;
    }

    /**
     * Check if an element type is registered
     */
    hasElement(type: string): boolean {
        return this.factories.has(type);
    }

    /**
     * Check if an element type is a built-in element
     */
    isBuiltIn(type: string): boolean {
        return this.builtInTypes.has(type);
    }

    /**
     * Get the plugin ID for a custom element type
     */
    getPluginId(type: string): string | undefined {
        return this.pluginTypes.get(type);
    }

    /**
     * Unregister all elements from a specific plugin
     */
    unregisterPlugin(pluginId: string): string[] {
        const unregistered: string[] = [];
        for (const [type, pid] of this.pluginTypes.entries()) {
            if (pid === pluginId) {
                this.factories.delete(type);
                this.schemas.delete(type);
                this.pluginTypes.delete(type);
                unregistered.push(type);
            }
        }
        return unregistered;
    }

    /**
     * Get all built-in element type strings.
     * Used for drift detection — tests assert this matches scripts/built-in-element-types.mjs.
     */
    getBuiltInTypes(): readonly string[] {
        return Array.from(this.builtInTypes);
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
                pluginId: this.pluginTypes.get(type) ?? null,
            };
        });
    }

    private registerDefaultElements() {
        this.registerElementFromClass('background', elements.BackgroundElement);
        this.registerElementFromClass('basicShapes', elements.BasicShapesElement);
        this.registerElementFromClass('image', elements.ImageElement);
        this.registerElementFromClass('progressDisplay', elements.ProgressDisplayElement);
        this.registerElementFromClass('textOverlay', elements.TextOverlayElement);
        this.registerElementFromClass('timeDisplay', elements.TimeDisplayElement);

        this.registerElementFromClass('timeUnitPianoRoll', elements.TimeUnitPianoRollElement);
        this.registerElementFromClass('movingNotesPianoRoll', elements.MovingNotesPianoRollElement);
        this.registerElementFromClass('notesPlayedTracker', elements.NotesPlayedTrackerElement);
        this.registerElementFromClass('notesPlayingDisplay', elements.NotesPlayingDisplayElement);
        this.registerElementFromClass('chordEstimateDisplay', elements.ChordEstimateDisplayElement);
        this.registerElementFromClass('ccMonitor', elements.CCMonitorElement);

        this.registerElementFromClass('audioSpectrum', elements.AudioSpectrumElement);
        this.registerElementFromClass('audioVolumeMeter', elements.AudioVolumeMeterElement);
        this.registerElementFromClass('audioWaveform', elements.AudioWaveformElement);
        this.registerElementFromClass('audioLockedOscilloscope', elements.AudioLockedOscilloscopeElement);

        // this.registerElementFromClass('audioMinimal', elements.AudioMinimalElement);
        // this.registerElementFromClass('audioOddProfile', elements.AudioOddProfileElement);
        // this.registerElementFromClass('audioAdhocProfile', elements.AudioAdhocProfileElement);
        // this.registerElementFromClass('audioBadReq', elements.AudioBadReqElement);
        // this.registerElementFromClass('audioDebug', elements.AudioDebugElement);
        this.registerElementFromClass('debug', elements.DebugElement);
    }
}

export const sceneElementRegistry = new SceneElementRegistry();
