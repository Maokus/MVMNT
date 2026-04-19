/**
 * AutomationLanes — right-column container for automation dope-sheet rows.
 *
 * Renders below track lane rows in the right column, mirroring
 * the structure of AutomationTrackLabels in the left column.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { useTickScale } from '../hooks/useTickScale';
import { useAutomatedElementIds, useElementChannels, useAutomationExpanded, useCurveEditorExpanded } from '@automation/hooks';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { copySelectedKeyframes, getKeyframeSelClipboard } from '@automation/clipboard';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT, AUTOMATION_SEARCH_HEIGHT } from '../constants';
import { useCurveHeight } from '../context/curveHeightContext';
import AutomationLaneRow from './AutomationLaneRow';
import AutomationCurvePane from './AutomationCurvePane';
import type { AutomationChannel } from '@automation/types';

/** Minimum pixel movement before a drag is treated as a selection box. */
const SEL_DRAG_THRESHOLD = 4;

interface CrossLaneSelBox {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    moved: boolean;
    shiftKey: boolean;
}

/** Single channel lane + optional curve pane. */
const ChannelLane: React.FC<{ channel: AutomationChannel; width: number }> = ({ channel, width }) => {
    const curveExpanded = useCurveEditorExpanded(channel.id);
    const curveHeight = useCurveHeight(channel.id);

    const handleCurveDoubleClick = useCallback(() => {
        useSceneStore.setState((state) => ({
            interaction: {
                ...state.interaction,
                automationExpandedCurves: state.interaction.automationExpandedCurves.filter(
                    (id) => id !== channel.id,
                ),
            },
        }));
    }, [channel.id]);

    return (
        <div data-channel-id={channel.id}>
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
                    onDoubleClick={handleCurveDoubleClick}
                >
                    <AutomationCurvePane channel={channel} width={width} />
                </div>
            )}
        </div>
    );
};

/** Lanes for a single element's automation channels. */
const ElementAutomationLanes: React.FC<{ elementId: string; width: number }> = ({ elementId, width }) => {
    const expanded = useAutomationExpanded(elementId);
    const channels = useElementChannels(elementId);
    const element = useSceneStore(useCallback((s) => s.elements[elementId], [elementId]));
    const searchQuery = useSceneStore((s) => s.interaction.automationSearchQuery);
    const { toX } = useTickScale();

    if (!element || channels.length === 0) return null;

    const lowerQuery = searchQuery.toLowerCase().trim();
    const visibleChannels = lowerQuery
        ? channels.filter((ch) => ch.propertyKey.toLowerCase().includes(lowerQuery))
        : channels;

    if (lowerQuery && visibleChannels.length === 0) return null;

    const isExpanded = lowerQuery ? true : expanded;

    // Collect unique keyframe ticks across all channels for the dot indicators
    const kfTicks = Array.from(new Set(channels.flatMap((ch) => ch.keyframes.map((kf) => kf.tick))));

    return (
        <>
            {/* Element header spacer with keyframe dot indicators */}
            <div
                className="relative border-b border-neutral-800"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            >
                {kfTicks.map((tick) => {
                    const x = toX(tick, width);
                    if (x < 0 || x > width) return null;
                    return (
                        <div
                            key={tick}
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-400 pointer-events-none"
                            style={{ left: x, width: 4, height: 4 }}
                        />
                    );
                })}
            </div>

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
    const { toTick } = useTickScale();

    // Cross-lane box select
    const containerRef = useRef<HTMLDivElement>(null);
    const selBoxRef = useRef<CrossLaneSelBox | null>(null);
    const [selBox, _setSelBox] = useState<CrossLaneSelBox | null>(null);
    const setSelBox = useCallback((next: CrossLaneSelBox | null) => {
        selBoxRef.current = next;
        _setSelBox(next);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (!e.shiftKey) {
            useSceneStore.setState((state) => ({
                interaction: { ...state.interaction, automationSelectedKeyframes: [] },
            }));
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setSelBox({ startX: x, startY: y, endX: x, endY: y, moved: false, shiftKey: e.shiftKey });
    }, [setSelBox]);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const sb = selBoxRef.current;
        if (!sb || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const moved = sb.moved
            || Math.abs(endX - sb.startX) > SEL_DRAG_THRESHOLD
            || Math.abs(endY - sb.startY) > SEL_DRAG_THRESHOLD;
        const next = { ...sb, endX, endY, moved };
        selBoxRef.current = next;
        _setSelBox(next);
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const sb = selBoxRef.current;
        if (!sb) return;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        if (sb.moved && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const minX = Math.min(sb.startX, sb.endX);
            const maxX = Math.max(sb.startX, sb.endX);
            const minAbsY = containerRect.top + Math.min(sb.startY, sb.endY);
            const maxAbsY = containerRect.top + Math.max(sb.startY, sb.endY);
            const minTick = toTick(minX, width);
            const maxTick = toTick(maxX, width);
            const laneEls = containerRef.current.querySelectorAll<HTMLElement>('[data-channel-id]');
            const enclosed: Array<{ channelId: string; tick: number }> = [];
            const channels = useSceneStore.getState().automation.channels;
            for (const el of laneEls) {
                const elRect = el.getBoundingClientRect();
                if (elRect.bottom < minAbsY || elRect.top > maxAbsY) continue;
                const channelId = el.dataset.channelId!;
                const ch = channels[channelId];
                if (!ch) continue;
                for (const kf of ch.keyframes) {
                    if (kf.tick >= minTick - 0.5 && kf.tick <= maxTick + 0.5) {
                        enclosed.push({ channelId, tick: kf.tick });
                    }
                }
            }
            useSceneStore.setState((state) => {
                if (sb.shiftKey) {
                    const selectedChannelIds = new Set(enclosed.map((k) => k.channelId));
                    const others = state.interaction.automationSelectedKeyframes.filter(
                        (k) => !selectedChannelIds.has(k.channelId),
                    );
                    return { interaction: { ...state.interaction, automationSelectedKeyframes: [...others, ...enclosed] } };
                }
                return { interaction: { ...state.interaction, automationSelectedKeyframes: enclosed } };
            });
        }
        setSelBox(null);
    }, [toTick, width, setSelBox]);

    const handlePointerCancel = useCallback(() => {
        setSelBox(null);
    }, [setSelBox]);

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

    const selBoxRect = selBox && selBox.moved ? {
        x: Math.min(selBox.startX, selBox.endX),
        y: Math.min(selBox.startY, selBox.endY),
        width: Math.abs(selBox.endX - selBox.startX),
        height: Math.abs(selBox.endY - selBox.startY),
    } : null;

    return (
        <div
            ref={containerRef}
            className="automation-lanes relative border-t border-neutral-700"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
        >
            {/* Section header spacer (mirrors left-column "AUTOMATION" header) */}
            <div
                className="border-b border-neutral-800"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            />
            {/* Search bar spacer (mirrors left-column search input row) */}
            <div
                className="border-b border-neutral-800"
                style={{ height: AUTOMATION_SEARCH_HEIGHT }}
            />

            {/* Element lane groups */}
            {automatedIds.map((id) => (
                <ElementAutomationLanes key={id} elementId={id} width={width} />
            ))}

            {/* Cross-lane selection box overlay */}
            {selBoxRect && (
                <div
                    className="absolute bg-blue-400/10 border border-blue-400 pointer-events-none"
                    style={{ left: selBoxRect.x, top: selBoxRect.y, width: selBoxRect.width, height: selBoxRect.height, zIndex: 10 }}
                />
            )}
        </div>
    );
};

export default AutomationLanes;
