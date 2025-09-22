import { HybridSceneBuilder } from '@core/scene-builder';
import { globalMacroManager } from '@bindings/macro-manager';

type BuilderElement = ReturnType<HybridSceneBuilder['serializeScene']>['elements'][number];
type MacroExport = ReturnType<typeof globalMacroManager.exportMacros>;

export interface SceneBuilderSnapshot {
    scene: {
        elements: BuilderElement[];
        sceneSettings: ReturnType<HybridSceneBuilder['getSceneSettings']>;
        macros: MacroExport;
    };
    assignments: Array<{ elementId: string; propertyPath: string; macroId: string }>;
    registry: {
        size: number;
        serializedElementIds: string[];
        registryKeys: string[];
        missingIds: string[];
        orphanRegistryIds: string[];
        duplicateElementIds: string[];
    };
    meta: {
        capturedAt: string;
    };
}

function resolveBuilder(builder?: HybridSceneBuilder | null) {
    if (builder) return builder;
    try {
        const fromWindow = (window as any)?.vis?.getSceneBuilder?.();
        if (fromWindow) return fromWindow;
    } catch (e) {
        /* noop */
    }
    throw new Error('snapshotBuilder: no HybridSceneBuilder instance provided or discoverable via window.vis');
}

export function snapshotBuilder(builder?: HybridSceneBuilder | null): SceneBuilderSnapshot {
    const target = resolveBuilder(builder);
    if (typeof target.serializeScene !== 'function') {
        throw new Error('snapshotBuilder: provided builder does not implement serializeScene()');
    }
    const serialized = target.serializeScene();

    const elements: BuilderElement[] = Array.isArray(serialized.elements)
        ? serialized.elements.map((el) => ({ ...el }))
        : [];
    const settings = target.getSceneSettings();
    const macros = serialized.macros as MacroExport;

    const serializedIds = elements
        .map((el) => (el as any).id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const duplicates = Array.from(
        serializedIds.reduce((acc, id) => {
            const next = (acc.get(id) || 0) + 1;
            acc.set(id, next);
            return acc;
        }, new Map<string, number>())
    )
        .filter(([, count]) => count > 1)
        .map(([id]) => id);

    const registryKeys = target.elementRegistry instanceof Map ? Array.from(target.elementRegistry.keys()) : [];
    const missingFromRegistry = serializedIds.filter((id) => !registryKeys.includes(id));
    const orphanRegistryIds = registryKeys.filter((id) => !serializedIds.includes(id));

    const assignments = typeof target.getAllMacroAssignments === 'function' ? target.getAllMacroAssignments() : [];

    return {
        scene: {
            elements,
            sceneSettings: { ...settings },
            macros,
        },
        assignments: assignments.map((entry: any) => ({
            elementId: entry.elementId,
            propertyPath: entry.propertyPath,
            macroId: entry.macroId,
        })),
        registry: {
            size: target.elementRegistry instanceof Map ? target.elementRegistry.size : registryKeys.length,
            serializedElementIds: serializedIds,
            registryKeys,
            missingIds: missingFromRegistry,
            orphanRegistryIds,
            duplicateElementIds: duplicates,
        },
        meta: {
            capturedAt: new Date().toISOString(),
        },
    };
}
