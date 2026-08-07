import type { SceneCommand } from './commandGateway';

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
    clearScene: snapshot(),
    resetSceneSettings: inverse(),
    updateSceneSettings: inverse(),
    loadSerializedScene: transaction('scene', 'runtime'),
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
    return sceneCommandDefinitions[command.type];
}
