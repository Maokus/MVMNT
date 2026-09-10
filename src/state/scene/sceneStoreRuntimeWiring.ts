import { automationEvaluator } from '@automation/automation-evaluator';
import { useTimelineStore } from '@state/timelineStore';
import { setSelectionChannelTargetResolver, setSelectionSceneResolvers } from '@state/selectionStore';
import type { StoreApi } from 'zustand';
import type { SceneStoreState } from './storeTypes';
import { useSceneEditorStore } from '@state/sceneEditorStore';

let disposeActiveWiring: (() => void) | undefined;

/**
 * Binds runtime services to a composed scene store. Keeping this outside the
 * store creator makes persistent slice construction side-effect free.
 */
export function wireSceneStoreRuntime(sceneStore: StoreApi<SceneStoreState>): () => void {
    disposeActiveWiring?.();
    automationEvaluator.setChannelProvider((channelId) => sceneStore.getState().automation.channels[channelId]);
    setSelectionChannelTargetResolver((channelId) => sceneStore.getState().automation.channels[channelId]?.target);
    setSelectionSceneResolvers({
        nodeIdForElement: (elementId) => sceneStore.getState().nodeIdByElementId[elementId],
        elementIdForNode: (nodeId) => sceneStore.getState().elementIdByNodeId[nodeId],
        graph: () => sceneStore.getState().graph,
    });

    let lastOverrideClearTick: number | null = null;
    const unsubscribeTimeline = useTimelineStore.subscribe((state) => {
        const tick = state.timeline.currentTick;
        if (tick !== lastOverrideClearTick) {
            if (lastOverrideClearTick !== null) useSceneEditorStore.getState().clearTransientNodeTransforms();
            lastOverrideClearTick = tick;
        }
    });
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        unsubscribeTimeline();
        automationEvaluator.setChannelProvider(() => undefined);
        setSelectionChannelTargetResolver(() => undefined);
        setSelectionSceneResolvers({
            nodeIdForElement: () => undefined,
            elementIdForNode: () => undefined,
            graph: () => sceneStore.getState().graph,
        });
        if (disposeActiveWiring === dispose) disposeActiveWiring = undefined;
    };
    disposeActiveWiring = dispose;
    return dispose;
}
