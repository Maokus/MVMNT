/**
 * KeyframeBinding — a property binding that evaluates an automation channel
 * at the current render time.
 *
 * Used by the scene element base class to resolve time-varying property values.
 * The preferred code path is `getValueWithContext` (called during render with targetTime).
 * `getValue` is a fallback that evaluates at the current timeline tick.
 */

import { PropertyBinding, registerKeyframeBindingFactory, type PropertyBindingContext, type PropertyBindingData } from './property-bindings';
import { automationEvaluator } from '@automation/automation-evaluator';
import { useTimelineStore } from '@state/timelineStore';
import { getSharedTimingManager } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';

export class KeyframeBinding<T = any> extends PropertyBinding<T> {
    private channelId: string;

    constructor(channelId: string) {
        super('keyframes');
        this.channelId = channelId;
    }

    /** Fallback: evaluate at current timeline tick (used outside render context). */
    getValue(): T {
        const override = useSceneStore.getState().propertyOverrides[this.channelId];
        if (override !== undefined) return override as T;
        try {
            const tick = useTimelineStore.getState().timeline.currentTick;
            return automationEvaluator.evaluate(this.channelId, tick) as T;
        } catch {
            return undefined as T;
        }
    }

    /** Preferred: evaluate at the render context's targetTime. */
    getValueWithContext(context: PropertyBindingContext): T {
        const override = useSceneStore.getState().propertyOverrides[this.channelId];
        if (override !== undefined) return override as T;
        try {
            const tm = getSharedTimingManager();
            if (tm) {
                const tick = tm.secondsToTicks(context.targetTime);
                return automationEvaluator.evaluate(this.channelId, tick) as T;
            }
        } catch {
            // Timing manager not available — fall back
        }
        return this.getValue();
    }

    /** No-op: keyframe bindings are not writable via setValue. Edits go through scene commands. */
    setValue(_value: T): void {
        // Intentionally empty — automation edits go through command gateway
    }

    getChannelId(): string {
        return this.channelId;
    }

    serialize(): PropertyBindingData {
        return { type: 'keyframes', channelId: this.channelId };
    }
}

// Self-register so PropertyBinding.fromSerialized can create KeyframeBinding
// without a circular require().
registerKeyframeBindingFactory((channelId: string) => new KeyframeBinding(channelId));
