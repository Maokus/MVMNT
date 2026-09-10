import type { PropertyBinding } from '@bindings/property-bindings';
import type { RenderObject } from '@core/render/render-objects';
import type { RegisteredElementSchema } from './schema';
import type { PerspectiveWarp } from '@math/perspective-warp';
import type { SimulationGeneration } from './simulation-inputs';
import type { SimulationStatus } from './simulation-runner';

/** Runtime-only instance consumed by the scene adapter and persistence bridge. */
export interface SceneElementInstance {
    type: string;
    id: string | null;
    visible: boolean;
    readonly hasSimulation?: boolean;
    getSimulationStatus?(session?: object): SimulationStatus;
    requestSimulationFrame?(
        seconds: number,
        generation: SimulationGeneration,
        changed: () => void,
        session?: object
    ): SimulationStatus;
    prepareSimulationFrame?(
        seconds: number,
        generation: SimulationGeneration,
        changed: () => void,
        signal?: AbortSignal,
        session?: object
    ): Promise<void>;
    releaseSimulationSession?(session: object): void;
    perspectiveWarp?: PerspectiveWarp | null;
    buildRenderObjects(config: unknown, targetTime: number): RenderObject[];
    updateConfig(config: Record<string, unknown>): SceneElementInstance;
    getSerializableConfig(): Record<string, unknown>;
    getBinding(propertyKey: string): PropertyBinding | undefined;
    markBoundsDirty(): void;
    dispose(): void;
}

export type SceneElementOrigin = { kind: 'built-in' } | { kind: 'plugin'; pluginId: string };

/** Fully normalized unit stored by SceneElementRegistry. */
export interface SceneElementRegistration {
    type: string;
    origin: SceneElementOrigin;
    schema: RegisteredElementSchema;
    create(config?: Record<string, unknown>): SceneElementInstance;
}

export interface SceneElementTypeInfo {
    type: string;
    name: string;
    description: string;
    category: string;
    pluginId: string | null;
}
