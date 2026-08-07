import { automationEvaluator } from '@automation/automation-evaluator';
import { useTimelineStore } from '@state/timelineStore';
import { setSelectionChannelTargetResolver, setSelectionSceneResolvers } from '@state/selectionStore';
import type { StoreApi } from 'zustand';
import type { SceneStoreState } from '../sceneStore';

/**
 * Binds runtime services to a composed scene store. Keeping this outside the
 * store creator makes persistent slice construction side-effect free.
 */
export function wireSceneStoreRuntime(sceneStore: StoreApi<SceneStoreState>): void {
    automationEvaluator.setChannelProvider((channelId) => sceneStore.getState().automation.channels[channelId]);
    setSelectionChannelTargetResolver((channelId) => sceneStore.getState().automation.channels[channelId]?.target);
    setSelectionSceneResolvers({
        nodeIdForElement: (elementId) => sceneStore.getState().nodeIdByElementId[elementId],
        elementIdForNode: (nodeId) => sceneStore.getState().elementIdByNodeId[nodeId],
        graph: () => sceneStore.getState().graph,
    });

    let lastOverrideClearTick: number | null = null;
    useTimelineStore.subscribe((state) => {
        const tick = state.timeline.currentTick;
        if (tick !== lastOverrideClearTick) {
            if (lastOverrideClearTick !== null) sceneStore.getState().clearTransientNodeTransforms();
            lastOverrideClearTick = tick;
        }
    });
}
