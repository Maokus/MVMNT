/**
 * AutomationLanes — right-column container for automation dope-sheet rows.
 *
 * Renders below track lane rows in the right column, mirroring
 * the structure of AutomationTrackLabels in the left column.
 */

import React, { useCallback, useEffect } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { useAutomatedElementIds, useElementChannels, useAutomationExpanded, useCurveEditorExpanded } from '@automation/hooks';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { copySelectedKeyframes, getKeyframeSelClipboard } from '@automation/clipboard';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT } from './constants';
import { useCurveHeight } from './curveHeightContext';
import AutomationLaneRow from './AutomationLaneRow';
import AutomationCurvePane from './AutomationCurvePane';
import type { AutomationChannel } from '@automation/types';

/** Single channel lane + optional curve pane. */
const ChannelLane: React.FC<{ channel: AutomationChannel; width: number }> = ({ channel, width }) => {
    const curveExpanded = useCurveEditorExpanded(channel.id);
    const curveHeight = useCurveHeight(channel.id);

    return (
        <>
            <div
                className="relative border-b border-neutral-800/60"
                style={{ height: AUTOMATION_ROW_HEIGHT }}
            >
                <AutomationLaneRow channel={channel} width={width} />
            </div>
            {curveExpanded && (
                <div
                    className="border-b border-neutral-800/60"
                    style={{ height: curveHeight }}
                >
                    <AutomationCurvePane channel={channel} width={width} />
                </div>
            )}
        </>
    );
};

/** Lanes for a single element's automation channels. */
const ElementAutomationLanes: React.FC<{ elementId: string; width: number }> = ({ elementId, width }) => {
    const expanded = useAutomationExpanded(elementId);
    const channels = useElementChannels(elementId);
    const element = useSceneStore(useCallback((s) => s.elements[elementId], [elementId]));
    const searchQuery = useSceneStore((s) => s.interaction.automationSearchQuery);

    if (!element || channels.length === 0) return null;

    const lowerQuery = searchQuery.toLowerCase().trim();
    const visibleChannels = lowerQuery
        ? channels.filter((ch) => ch.propertyKey.toLowerCase().includes(lowerQuery))
        : channels;

    if (lowerQuery && visibleChannels.length === 0) return null;

    const isExpanded = lowerQuery ? true : expanded;

    return (
        <>
            {/* Element header spacer (mirrors left-column header height) */}
            <div
                className="border-b border-neutral-800"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            />

            {/* Channel lane rows (when expanded) */}
            {isExpanded && visibleChannels.map((ch) => (
                <ChannelLane key={ch.id} channel={ch} width={width} />
            ))}
        </>
    );
};

interface AutomationLanesProps {
    width: number;
}

const AutomationLanes: React.FC<AutomationLanesProps> = ({ width }) => {
    const automatedIds = useAutomatedElementIds();

    // Keyboard shortcuts: copy/paste/delete keyframes, j/k navigate prev/next keyframe
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            if (active) {
                const tag = active.tagName;
                if (active.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA') return;
            }

            // J = previous keyframe globally, K = next keyframe globally
            if (e.key === 'j' || e.key === 'k') {
                const sceneState = useSceneStore.getState();
                const allTicks = Object.values(sceneState.automation.channels)
                    .flatMap((ch) => ch.keyframes.map((kf) => kf.tick));
                if (allTicks.length === 0) return;
                const unique = [...new Set(allTicks)].sort((a, b) => a - b);
                const currentTick = useTimelineStore.getState().timeline.currentTick;
                if (e.key === 'j') {
                    const prev = [...unique].reverse().find((t) => t < currentTick - 0.5);
                    if (prev !== undefined) {
                        e.preventDefault();
                        useTimelineStore.getState().seekTick(prev);
                    }
                } else {
                    const next = unique.find((t) => t > currentTick + 0.5);
                    if (next !== undefined) {
                        e.preventDefault();
                        useTimelineStore.getState().seekTick(next);
                    }
                }
                return;
            }

            // Copy selected keyframes
            if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
                const selected = useSceneStore.getState().interaction.automationSelectedKeyframes;
                if (selected.length === 0) return;
                e.preventDefault();
                e.stopPropagation();
                // Group by channelId
                const byChannel = new Map<string, number[]>();
                for (const { channelId, tick } of selected) {
                    if (!byChannel.has(channelId)) byChannel.set(channelId, []);
                    byChannel.get(channelId)!.push(tick);
                }
                const state = useSceneStore.getState();
                const entries: Array<{ channelId: string; keyframes: { tick: number; value: unknown; easingId: string }[] }> = [];
                for (const [channelId, ticks] of byChannel) {
                    const ch = state.automation.channels[channelId];
                    if (!ch) continue;
                    const kfs = ch.keyframes.filter((kf) =>
                        ticks.some((t) => Math.abs(kf.tick - t) < 0.5),
                    );
                    if (kfs.length > 0) entries.push({ channelId, keyframes: kfs });
                }
                copySelectedKeyframes(entries);
                return;
            }

            // Duplicate selected keyframes immediately after the selection (tiles on repeat)
            if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
                const selected = useSceneStore.getState().interaction.automationSelectedKeyframes;
                if (selected.length === 0) return;
                e.preventDefault();
                e.stopPropagation();

                selected.sort((a, b) => a.tick - b.tick);
                const minTick = selected[0].tick;
                const maxTick = selected[selected.length - 1].tick;
                const span = maxTick - minTick;
                if (span === 0) return; // single tick — no meaningful tile

                const state = useSceneStore.getState();
                const mergeKey = `duplicate-kf-${Date.now()}`;
                const newSelected: Array<{ channelId: string; tick: number }> = [];

                // The first new keyframe lands at minTick + span = maxTick, which would override
                // any selected keyframe already there. Move those back by one tick first.
                for (const { channelId, tick } of selected) {
                    if (Math.abs(tick - maxTick) < 0.5) {
                        dispatchSceneCommand(
                            { type: 'moveKeyframe', channelId, fromTick: tick, toTick: tick - 1 },
                            { source: 'automation-lane', mergeKey },
                        );
                    }
                }

                for (const { channelId, tick } of selected) {
                    const ch = state.automation.channels[channelId];
                    if (!ch) continue;
                    const kf = ch.keyframes.find((k) => Math.abs(k.tick - tick) < 0.5);
                    if (!kf) continue;
                    const newTick = tick + span;

                    dispatchSceneCommand(
                        { type: 'addKeyframe', channelId, keyframe: { ...kf, tick: newTick } },
                        { source: 'automation-lane', mergeKey },
                    );
                    newSelected.push({ channelId, tick: newTick });
                }

                // Shift selection to duplicated block — next Cmd+D tiles another copy
                useSceneStore.setState((s) => ({
                    interaction: { ...s.interaction, automationSelectedKeyframes: newSelected },
                }));
                return;
            }

            // Paste selected keyframes (offset to playhead)
            if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
                const clip = getKeyframeSelClipboard();
                if (!clip) return;
                e.preventDefault();
                e.stopPropagation();
                const currentTick = useTimelineStore.getState().timeline.currentTick ?? 0;
                const tickOffset = currentTick - clip.minTick;
                for (const entry of clip.entries) {
                    for (const kf of entry.keyframes) {
                        const newTick = Math.max(0, Math.round(kf.tick + tickOffset));
                        dispatchSceneCommand(
                            {
                                type: 'addKeyframe',
                                channelId: entry.channelId,
                                keyframe: { ...kf, tick: newTick },
                            },
                            { source: 'automation-lane' },
                        );
                    }
                }
                return;
            }

            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const selected = useSceneStore.getState().interaction.automationSelectedKeyframes;
            if (selected.length === 0) return;
            e.preventDefault();
            e.stopPropagation();
            for (const kf of selected) {
                dispatchSceneCommand(
                    { type: 'removeKeyframe', channelId: kf.channelId, tick: kf.tick },
                    { source: 'automation-lane' },
                );
            }
            useSceneStore.setState((state) => ({
                interaction: {
                    ...state.interaction,
                    automationSelectedKeyframes: [],
                },
            }));
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as any);
    }, []);

    if (automatedIds.length === 0) return null;

    return (
        <div className="automation-lanes border-t border-neutral-700">
            {/* Section header spacer (mirrors left-column "AUTOMATION" header) */}
            <div
                className="border-b border-neutral-800"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            />

            {/* Element lane groups */}
            {automatedIds.map((id) => (
                <ElementAutomationLanes key={id} elementId={id} width={width} />
            ))}
        </div>
    );
};

export default AutomationLanes;
