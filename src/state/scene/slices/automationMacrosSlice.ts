import type { SceneStoreState } from '../storeTypes';
import { automationEvaluator } from '@automation/automation-evaluator';
import { encodePropertyTarget, rebuildAutomationTargetIndex } from '@automation/types';

type SceneStoreSet = (
    partial: Partial<SceneStoreState> | ((state: SceneStoreState) => Partial<SceneStoreState>),
    replace?: boolean
) => void;

type AutomationChannelActions = Pick<
    SceneStoreState,
    'setAutomationChannel' | 'removeAutomationChannel' | 'updateAutomationKeyframes'
>;

/** Creates automation-channel mutations with explicit store dependencies. */
export function createAutomationChannelActions(
    set: SceneStoreSet,
    markDirty: (state: SceneStoreState) => SceneStoreState['runtimeMeta']
): AutomationChannelActions {
    return {
        setAutomationChannel(channel) {
            set((state) => ({
                automation: {
                    channels: { ...state.automation.channels, [channel.id]: channel },
                    channelIdByTarget: {
                        ...state.automation.channelIdByTarget,
                        [encodePropertyTarget(channel.target)]: channel.id,
                    },
                },
                runtimeMeta: markDirty(state),
            }));
        },
        removeAutomationChannel(channelId) {
            automationEvaluator.invalidateChannel(channelId);
            set((state) => {
                const { [channelId]: _removed, ...remaining } = state.automation.channels;
                return {
                    automation: { channels: remaining, channelIdByTarget: rebuildAutomationTargetIndex(remaining) },
                    runtimeMeta: markDirty(state),
                };
            });
        },
        updateAutomationKeyframes(channelId, keyframes) {
            automationEvaluator.invalidateChannel(channelId);
            set((state) => {
                const channel = state.automation.channels[channelId];
                if (!channel) return state;
                return {
                    automation: {
                        channels: {
                            ...state.automation.channels,
                            [channelId]: { ...channel, keyframes },
                        },
                        channelIdByTarget: state.automation.channelIdByTarget,
                    },
                    runtimeMeta: markDirty(state),
                };
            });
        },
    };
}
