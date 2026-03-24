/**
 * AutomationEvaluator — singleton service that evaluates automation channels.
 *
 * Lazily compiles AutomationCurve instances per channel and caches them.
 * The cache is invalidated when channels change (via `invalidateChannel`).
 */

import { AutomationCurve } from './automation-curve';
import type { AutomationChannel } from './types';

/** Function that retrieves a channel from the scene store. */
type ChannelProvider = (channelId: string) => AutomationChannel | undefined;

export class AutomationEvaluatorImpl {
    private curveCache = new Map<string, AutomationCurve>();
    private channelProvider: ChannelProvider | null = null;

    /**
     * Set the channel provider function. Called once during app initialization
     * to wire the evaluator to the scene store without a direct import.
     */
    setChannelProvider(provider: ChannelProvider): void {
        this.channelProvider = provider;
    }

    /** Evaluate an automation channel at the given tick. Returns undefined if channel not found. */
    evaluate(channelId: string, tick: number): unknown {
        const curve = this.getOrBuildCurve(channelId);
        if (!curve) return undefined;
        return curve.evaluate(tick);
    }

    /** Get or lazily build the curve for a channel. */
    getOrBuildCurve(channelId: string): AutomationCurve | null {
        let curve = this.curveCache.get(channelId);
        if (curve) return curve;

        const channel = this.resolveChannel(channelId);
        if (!channel) return null;

        curve = new AutomationCurve(channel);
        this.curveCache.set(channelId, curve);
        return curve;
    }

    /** Invalidate the cached curve for a specific channel. */
    invalidateChannel(channelId: string): void {
        this.curveCache.delete(channelId);
    }

    /** Clear all cached curves. */
    invalidateAll(): void {
        this.curveCache.clear();
    }

    private resolveChannel(channelId: string): AutomationChannel | undefined {
        if (this.channelProvider) {
            return this.channelProvider(channelId);
        }

        // Fallback: try to import the store directly (lazy to avoid circular deps at module load)
        try {
            const { useSceneStore } = require('@state/sceneStore');
            return useSceneStore.getState().automation.channels[channelId];
        } catch {
            return undefined;
        }
    }
}

/** Module-level singleton. */
export const automationEvaluator = new AutomationEvaluatorImpl();
