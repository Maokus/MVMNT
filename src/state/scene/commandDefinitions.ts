import type { SceneCommand } from './commandTypes';

export type ScenePersistenceImpact = 'none' | 'scene' | 'multi-store';
export type SceneRollbackStrategy = 'inverse-patch' | 'snapshot' | 'transaction';
export type SceneStoreBoundary = 'scene' | 'timeline' | 'metadata' | 'assets' | 'runtime';

export interface SceneCommandDefinition {
    persistenceImpact: ScenePersistenceImpact;
    rollback: SceneRollbackStrategy;
    /** All stores/services the command may mutate as one atomic operation. */
    boundaries: readonly SceneStoreBoundary[];
}

type SceneCommandType = SceneCommand['type'];

const inverse = (): SceneCommandDefinition => ({
    persistenceImpact: 'scene',
    rollback: 'inverse-patch',
    boundaries: ['scene'],
});
const snapshot = (): SceneCommandDefinition => ({
    persistenceImpact: 'scene',
    rollback: 'snapshot',
    boundaries: ['scene'],
});
const transaction = (...boundaries: SceneStoreBoundary[]): SceneCommandDefinition => ({
    persistenceImpact: 'multi-store',
    rollback: 'transaction',
    boundaries,
});

/** Every scene command must explicitly state its persistence and rollback contract. */
export const sceneCommandDefinitions: Record<SceneCommandType, SceneCommandDefinition> = {
    batch: transaction('scene', 'runtime'),
    addElement: snapshot(),
    removeElement: snapshot(),
    updateElementConfig: inverse(),
    moveElement: snapshot(),
    duplicateElement: snapshot(),
    updateElementId: snapshot(),
    clearScene: transaction('scene', 'timeline', 'metadata', 'assets', 'runtime'),
    restoreClearScene: transaction('scene', 'timeline', 'metadata', 'assets', 'runtime'),
    resetSceneSettings: inverse(),
    updateSceneSettings: inverse(),
    loadSerializedScene: transaction('scene', 'runtime'),
    registerFontAsset: snapshot(),
    resolveMissingFontTokens: snapshot(),
    deleteFontAsset: snapshot(),
    importSubtreeBundle: transaction('scene', 'runtime'),
    createMacro: inverse(),
    updateMacroValue: inverse(),
    renameMacro: transaction('scene', 'runtime'),
    deleteMacro: snapshot(),
    reorderMacros: inverse(),
    importMacros: snapshot(),
    enablePropertyAutomation: transaction('scene', 'runtime'),
    disablePropertyAutomation: transaction('scene', 'runtime'),
    updatePropertyTargetBinding: transaction('scene', 'runtime'),
    addKeyframe: inverse(),
    removeKeyframe: inverse(),
    updateKeyframe: inverse(),
    moveKeyframe: inverse(),
    batchUpdateKeyframes: inverse(),
    replaceGraph: transaction('scene', 'runtime'),
    updateNodeTransform: snapshot(),
    setNodeVisibility: snapshot(),
    setNodeOpacity: snapshot(),
    setNodeOutputBlendMode: snapshot(),
    setNodeLocked: snapshot(),
    setNodeName: snapshot(),
    groupNodes: transaction('scene', 'runtime'),
    ungroupNode: transaction('scene', 'runtime'),
    deleteSubtrees: transaction('scene', 'runtime'),
    duplicateSubtrees: transaction('scene', 'runtime'),
    reorderNodes: transaction('scene', 'runtime'),
    reparentNodes: transaction('scene', 'runtime'),
    transformNodes: snapshot(),
};

export function sceneCommandDefinition(command: SceneCommand): SceneCommandDefinition {
    if (command.type === 'batch') {
        const boundaries = new Set<SceneStoreBoundary>(['scene', 'runtime']);
        for (const child of command.commands) {
            for (const boundary of sceneCommandDefinition(child).boundaries) boundaries.add(boundary);
        }
        return validateSceneCommandDefinition('batch', transaction(...boundaries));
    }
    const definition = sceneCommandDefinitions[command.type];
    if (!definition) {
        throw new Error(`Scene command "${command.type}" has no command definition`);
    }
    validateSceneCommandDefinition(command.type, definition);
    return definition;
}

/**
 * Keep command metadata executable: commands which span stores must opt in to
 * transaction rollback, and their declared boundaries must be meaningful.
 */
export function validateSceneCommandDefinition(
    commandType: string,
    definition: SceneCommandDefinition
): SceneCommandDefinition {
    const boundaries = new Set(definition.boundaries);
    if (!boundaries.size) {
        throw new Error(`Scene command "${commandType}" must declare at least one store boundary`);
    }
    if (definition.persistenceImpact === 'multi-store' && boundaries.size < 2) {
        throw new Error(`Multi-store scene command "${commandType}" must declare every transactional boundary`);
    }
    if (definition.rollback === 'transaction' && definition.persistenceImpact !== 'multi-store') {
        throw new Error(`Transactional scene command "${commandType}" must have multi-store persistence impact`);
    }
    if (definition.rollback !== 'transaction' && definition.persistenceImpact === 'multi-store') {
        throw new Error(`Multi-store scene command "${commandType}" must use transaction rollback`);
    }
    return definition;
}
