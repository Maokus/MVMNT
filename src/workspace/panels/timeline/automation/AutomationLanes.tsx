/**
 * AutomationLanes — right-column container for automation dope-sheet rows.
 *
 * Renders below track lane rows in the right column, mirroring
 * the structure of AutomationTrackLabels in the left column.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { useSelectionStore } from '@state/selectionStore';
import { useTickScale } from '../hooks/useTickScale';
import { useSnapTicks } from '../hooks/useSnapTicks';
import { useAutomationSceneNodes, useAutomationExpanded, useCurveEditorExpanded } from '@automation/hooks';
import { dispatchSceneCommand } from '@state/scene';
import { copySelectedKeyframes, getKeyframeSelClipboard } from '@automation/clipboard';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT, AUTOMATION_SEARCH_HEIGHT } from '../constants';
import { useCurveHeight } from '../context/curveHeightContext';
import AutomationLaneRow from './AutomationLaneRow';
import AutomationCurvePane from './AutomationCurvePane';
import type { AutomationChannel, AutomationKeyframe } from '@automation/types';
import type { AutomatedSceneNodeView } from '@automation/selectors';
import { descriptorForTarget, fallbackDescriptor } from '@state/scene/propertyCatalog';
import { isTextEditingTarget, useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';

interface KfMove {
    channelId: string;
    baseTick: number;
    curTick: number;
}

interface DotDragState {
    /** Original tick of the diamond that was grabbed. */
    primaryBaseTick: number;
    /** Current live tick of the primary (drives collision avoidance + display). */
    primaryCurTick: number;
    sessionId: string;
    offsetX: number;
    /** All selected kfs to move, including those at the primary tick. */
    moves: KfMove[];
}

const HEADER_DIAMOND_SIZE = 6;

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
        const editor = useSceneEditorStore.getState();
        editor.setAutomationExpandedCurves(editor.automationExpandedCurves.filter((id) => id !== channel.id));
    }, [channel.id]);

    return (
        <div data-channel-id={channel.id}>
            <div className="relative border-b border-neutral-800/60" style={{ height: AUTOMATION_ROW_HEIGHT }}>
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
const SceneNodeAutomationLanes: React.FC<{ row: AutomatedSceneNodeView; width: number }> = ({ row, width }) => {
    const expanded = useAutomationExpanded({ kind: 'node', id: row.nodeId });
    const channels = [...row.hostChannels, ...row.contentChannels];
    const searchQuery = useSceneEditorStore((s) => s.automationSearchQuery);
    const { toX, toTick } = useTickScale();
    const snapTick = useSnapTicks();

    // Track selection state to drive diamond visuals
    const selectedKeyframes = useSelectionStore((s) => s.selectedKeyframes);

    const headerRef = useRef<HTMLDivElement>(null);
    const [dotDrag, _setDotDrag] = useState<DotDragState | null>(null);
    const dotDragRef = useRef<DotDragState | null>(null);
    const setDotDrag = useCallback((next: DotDragState | null) => {
        dotDragRef.current = next;
        _setDotDrag(next);
    }, []);

    // Selection state per tick: 'none' | 'partial' | 'full'
    const getTickSelectionState = useCallback(
        (tick: number): 'none' | 'partial' | 'full' => {
            const channelsAtTick = channels.filter((ch) => ch.keyframes.some((kf) => Math.abs(kf.tick - tick) < 0.5));
            if (channelsAtTick.length === 0) return 'none';
            const selectedCount = channelsAtTick.filter((ch) =>
                selectedKeyframes.some((k) => k.channelId === ch.id && Math.abs(k.tick - tick) < 0.5)
            ).length;
            if (selectedCount === 0) return 'none';
            return selectedCount === channelsAtTick.length ? 'full' : 'partial';
        },
        [channels, selectedKeyframes]
    );

    const handleDiamondPointerDown = useCallback(
        (e: React.PointerEvent<SVGElement>, tick: number) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();

            const kfsAtTick = channels
                .filter((ch) => ch.keyframes.some((kf) => Math.abs(kf.tick - tick) < 0.5))
                .map((ch) => ({ channelId: ch.id, tick }));

            const existing = useSelectionStore.getState().selectedKeyframes;
            const allAtTickSelected = kfsAtTick.every((k) =>
                existing.some((e) => e.channelId === k.channelId && Math.abs(e.tick - k.tick) < 0.5)
            );

            let newSelected: Array<{ channelId: string; tick: number }>;
            if (e.shiftKey) {
                if (allAtTickSelected) {
                    newSelected = existing.filter(
                        (e) => !kfsAtTick.some((k) => k.channelId === e.channelId && Math.abs(k.tick - e.tick) < 0.5)
                    );
                } else {
                    const toAdd = kfsAtTick.filter(
                        (k) => !existing.some((e) => e.channelId === k.channelId && Math.abs(e.tick - k.tick) < 0.5)
                    );
                    newSelected = [...existing, ...toAdd];
                }
            } else if (allAtTickSelected) {
                // Keep full selection intact for drag
                newSelected = existing;
            } else {
                newSelected = kfsAtTick;
            }

            useSelectionStore.getState().selectKeyframes(newSelected);

            const rect = headerRef.current?.getBoundingClientRect();
            const dotX = rect ? toX(tick, width) : 0;
            const offsetX = rect ? e.clientX - rect.left - dotX : 0;
            headerRef.current?.setPointerCapture(e.pointerId);

            const moves: KfMove[] = newSelected.map((k) => ({
                channelId: k.channelId,
                baseTick: k.tick,
                curTick: k.tick,
            }));

            setDotDrag({
                primaryBaseTick: tick,
                primaryCurTick: tick,
                sessionId: `${Date.now()}-${Math.random()}`,
                offsetX,
                moves,
            });
        },
        [channels, toX, width, setDotDrag]
    );

    // Empty-space click in the SVG bubbles to the outer AutomationLanes cross-lane marquee.
    // Diamond pointer down stops propagation to initiate drag instead.

    const handleHeaderPointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.buttons === 0) {
                if (dotDragRef.current) setDotDrag(null);
                return;
            }

            // --- diamond drag ---
            const drag = dotDragRef.current;
            if (!drag) return;
            const rect = headerRef.current?.getBoundingClientRect();
            if (!rect) return;

            const pixelX = e.clientX - rect.left - drag.offsetX;
            const candTick = toTick(pixelX, width);
            const snapped = snapTick(candTick, e.ctrlKey || e.metaKey);
            if (snapped === drag.primaryCurTick) return;

            const currentChannelsData = useSceneStore.getState().automation.channels;
            const dir = snapped > drag.primaryBaseTick ? 1 : -1;

            const primaryMoves = drag.moves.filter((m) => Math.abs(m.baseTick - drag.primaryBaseTick) < 0.5);
            const isAnyPrimaryOccupied = (t: number) =>
                primaryMoves.some((m) => {
                    const chData = currentChannelsData[m.channelId];
                    return chData?.keyframes.some(
                        (kf) => Math.abs(kf.tick - t) < 0.5 && Math.abs(kf.tick - m.curTick) >= 0.5
                    );
                });
            let resolvedPrimaryTick = snapped;
            if (isAnyPrimaryOccupied(resolvedPrimaryTick)) {
                let candidate = resolvedPrimaryTick + dir;
                while (candidate >= 0 && isAnyPrimaryOccupied(candidate)) candidate += dir;
                resolvedPrimaryTick = Math.max(0, candidate);
                if (isAnyPrimaryOccupied(resolvedPrimaryTick)) resolvedPrimaryTick = drag.primaryCurTick;
            }
            if (resolvedPrimaryTick === drag.primaryCurTick) return;

            const delta = resolvedPrimaryTick - drag.primaryBaseTick;

            const updatedMoves = drag.moves.map((move) => {
                const rawTick = snapTick(Math.max(0, move.baseTick + delta), e.ctrlKey || e.metaKey);
                const chData = currentChannelsData[move.channelId];
                if (!chData) return move;

                const isOccupied = (t: number) =>
                    chData.keyframes.some(
                        (kf) => Math.abs(kf.tick - t) < 0.5 && Math.abs(kf.tick - move.curTick) >= 0.5
                    );
                let newTick = rawTick;
                if (isOccupied(newTick)) {
                    let candidate = newTick + dir;
                    while (candidate >= 0 && isOccupied(candidate)) candidate += dir;
                    newTick = Math.max(0, candidate);
                    if (isOccupied(newTick)) newTick = move.curTick;
                }

                if (newTick !== move.curTick) {
                    dispatchSceneCommand(
                        { type: 'moveKeyframe', channelId: move.channelId, fromTick: move.curTick, toTick: newTick },
                        { source: 'track-lane-dot', mergeKey: `dot-move:${drag.sessionId}`, transient: true }
                    );
                }
                return { ...move, curTick: newTick };
            });

            useSelectionStore
                .getState()
                .selectKeyframes(updatedMoves.map((m) => ({ channelId: m.channelId, tick: m.curTick })));

            setDotDrag({ ...drag, primaryCurTick: resolvedPrimaryTick, moves: updatedMoves });
        },
        [toTick, width, snapTick, setDotDrag]
    );

    const handleHeaderPointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            try {
                headerRef.current?.releasePointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }

            // --- diamond drag commit ---
            const drag = dotDragRef.current;
            if (!drag) return;
            if (drag.primaryCurTick !== drag.primaryBaseTick) {
                for (const move of drag.moves) {
                    if (move.curTick !== move.baseTick) {
                        dispatchSceneCommand(
                            {
                                type: 'moveKeyframe',
                                channelId: move.channelId,
                                fromTick: move.curTick,
                                toTick: move.curTick,
                            },
                            { source: 'track-lane-dot', mergeKey: `dot-move:${drag.sessionId}`, transient: false }
                        );
                    }
                }
            }
            setDotDrag(null);
        },
        [setDotDrag]
    );

    const lowerQuery = searchQuery.toLowerCase().trim();
    const visibleChannels = lowerQuery
        ? channels.filter((ch) => {
              const descriptor =
                  descriptorForTarget(ch.target, row.elementType) ?? fallbackDescriptor(ch.target, ch.valueType);
              return [ch.target.propertyPath, descriptor.definition.label, descriptor.group.label, row.name]
                  .join(' ')
                  .toLowerCase()
                  .includes(lowerQuery);
          })
        : channels;

    if (lowerQuery && visibleChannels.length === 0) return null;

    const isExpanded = lowerQuery ? true : expanded;

    const kfTicks = Array.from(new Set(channels.flatMap((ch) => ch.keyframes.map((kf) => kf.tick))));
    const cy = AUTOMATION_HEADER_HEIGHT / 2;
    const s = HEADER_DIAMOND_SIZE;

    return (
        <>
            {/* Element header with SVG diamond indicators */}
            <div
                ref={headerRef}
                data-scene-node-id={row.nodeId}
                data-channel-ids={channels.map((channel) => channel.id).join(',')}
                className="relative border-b border-neutral-800"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
                onPointerMove={handleHeaderPointerMove}
                onPointerUp={handleHeaderPointerUp}
                onPointerCancel={() => {
                    setDotDrag(null);
                }}
            >
                <svg width={width} height={AUTOMATION_HEADER_HEIGHT} style={{ display: 'block', overflow: 'visible' }}>
                    {kfTicks.map((tick) => {
                        const x = toX(tick, width);
                        if (x < -s || x > width + s) return null;
                        const selState = getTickSelectionState(tick);
                        const isDragging =
                            dotDrag !== null &&
                            Math.abs(tick - dotDrag.primaryCurTick) < 0.5 &&
                            dotDrag.moves.some((m) => Math.abs(m.baseTick - tick) < 0.5);
                        const fill =
                            selState === 'full'
                                ? '#ffffff'
                                : selState === 'partial'
                                  ? 'rgba(255,255,255,0.45)'
                                  : 'rgba(96,165,250,0.55)';
                        const stroke = selState === 'none' ? 'rgba(96,165,250,0.5)' : '#60a5fa';
                        const strokeWidth = selState === 'none' ? 1 : 1.5;
                        const size = selState !== 'none' || isDragging ? s + 1 : s;
                        return (
                            <g
                                key={tick}
                                style={{ cursor: dotDrag ? 'grabbing' : 'grab' }}
                                onPointerDown={(e) => handleDiamondPointerDown(e, tick)}
                            >
                                <path
                                    d={`M${x},${cy - size} L${x - size},${cy} L${x},${cy + size} L${x + size},${cy} Z`}
                                    fill={fill}
                                    stroke={stroke}
                                    strokeWidth={strokeWidth}
                                    strokeLinejoin="round"
                                />
                                {/* Larger hit area */}
                                <rect
                                    x={x - s - 4}
                                    y={cy - s - 4}
                                    width={s * 2 + 8}
                                    height={s * 2 + 8}
                                    fill="transparent"
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Channel lane rows (when expanded) */}
            {isExpanded && visibleChannels.map((ch) => <ChannelLane key={ch.id} channel={ch} width={width} />)}
        </>
    );
};

interface AutomationLanesProps {
    width: number;
}

const AutomationLanes: React.FC<AutomationLanesProps> = ({ width }) => {
    const automationRows = useAutomationSceneNodes();
    const expandedSceneNodes = useSelectionStore((state) => state.expandedNodeIds);
    const hierarchySearch = useSceneEditorStore((state) => state.automationSearchQuery.trim());
    const visibleAutomationRows = hierarchySearch
        ? automationRows
        : automationRows.filter((row) =>
              row.ancestorNodeIds.every((ancestorId) => expandedSceneNodes[ancestorId] !== false)
          );
    const { toTick } = useTickScale();

    // Cross-lane box select
    const containerRef = useRef<HTMLDivElement>(null);
    const selBoxRef = useRef<CrossLaneSelBox | null>(null);
    const [selBox, _setSelBox] = useState<CrossLaneSelBox | null>(null);
    const setSelBox = useCallback((next: CrossLaneSelBox | null) => {
        selBoxRef.current = next;
        _setSelBox(next);
    }, []);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (!e.shiftKey) {
                useSelectionStore.getState().clearSelection('keyframes');
            }
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setSelBox({ startX: x, startY: y, endX: x, endY: y, moved: false, shiftKey: e.shiftKey });
        },
        [setSelBox]
    );

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const sb = selBoxRef.current;
        if (!sb || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const moved =
            sb.moved ||
            Math.abs(endX - sb.startX) > SEL_DRAG_THRESHOLD ||
            Math.abs(endY - sb.startY) > SEL_DRAG_THRESHOLD;
        const next = { ...sb, endX, endY, moved };
        selBoxRef.current = next;
        _setSelBox(next);
    }, []);

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const sb = selBoxRef.current;
            if (!sb) return;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            if (sb.moved && containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const minX = Math.min(sb.startX, sb.endX);
                const maxX = Math.max(sb.startX, sb.endX);
                const minAbsY = containerRect.top + Math.min(sb.startY, sb.endY);
                const maxAbsY = containerRect.top + Math.max(sb.startY, sb.endY);
                const minTick = toTick(minX, width);
                const maxTick = toTick(maxX, width);
                const channels = useSceneStore.getState().automation.channels;
                const enclosed: Array<{ channelId: string; tick: number }> = [];
                const addedKeys = new Set<string>();

                const addKf = (channelId: string, tick: number) => {
                    const key = `${channelId}:${tick}`;
                    if (!addedKeys.has(key)) {
                        addedKeys.add(key);
                        enclosed.push({ channelId, tick });
                    }
                };

                // Individual channel lane rows
                const laneEls = containerRef.current.querySelectorAll<HTMLElement>('[data-channel-id]');
                for (const el of laneEls) {
                    const elRect = el.getBoundingClientRect();
                    if (elRect.bottom < minAbsY || elRect.top > maxAbsY) continue;
                    const channelId = el.dataset.channelId!;
                    const ch = channels[channelId];
                    if (!ch) continue;
                    for (const kf of ch.keyframes) {
                        if (kf.tick >= minTick - 0.5 && kf.tick <= maxTick + 0.5) {
                            addKf(channelId, kf.tick);
                        }
                    }
                }

                // Scene-node header rows include direct host and element-content channels.
                const headerEls = containerRef.current.querySelectorAll<HTMLElement>('[data-channel-ids]');
                for (const el of headerEls) {
                    const elRect = el.getBoundingClientRect();
                    if (elRect.bottom < minAbsY || elRect.top > maxAbsY) continue;
                    const channelIds = (el.dataset.channelIds ?? '').split(',').filter(Boolean);
                    for (const channelId of channelIds) {
                        const ch = channels[channelId];
                        if (!ch) continue;
                        for (const kf of ch.keyframes) {
                            if (kf.tick >= minTick - 0.5 && kf.tick <= maxTick + 0.5) {
                                addKf(ch.id, kf.tick);
                            }
                        }
                    }
                }

                if (sb.shiftKey) {
                    const enclosedKeys = new Set(enclosed.map((k) => `${k.channelId}:${k.tick}`));
                    const others = useSelectionStore
                        .getState()
                        .selectedKeyframes.filter((k) => !enclosedKeys.has(`${k.channelId}:${k.tick}`));
                    useSelectionStore.getState().selectKeyframes([...others, ...enclosed]);
                } else {
                    useSelectionStore.getState().selectKeyframes(enclosed);
                }
            }
            setSelBox(null);
        },
        [toTick, width, setSelBox]
    );

    const handlePointerCancel = useCallback(() => {
        setSelBox(null);
    }, [setSelBox]);

    // Keyboard shortcuts: copy/paste/delete keyframes, j/k navigate prev/next keyframe
    const handleAutomationShortcut = useCallback((e: KeyboardEvent) => {
        if (isTextEditingTarget(e.target)) return;

        // J = previous keyframe globally, K = next keyframe globally
        if (e.key === 'j' || e.key === 'k') {
            const sceneState = useSceneStore.getState();
            const allTicks = Object.values(sceneState.automation.channels).flatMap((ch) =>
                ch.keyframes.map((kf) => kf.tick)
            );
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
            const selected = useSelectionStore.getState().selectedKeyframes;
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
            const entries: Array<{ channelId: string; keyframes: AutomationKeyframe[] }> = [];
            for (const [channelId, ticks] of byChannel) {
                const ch = state.automation.channels[channelId];
                if (!ch) continue;
                const kfs = ch.keyframes.filter((kf) => ticks.some((t) => Math.abs(kf.tick - t) < 0.5));
                if (kfs.length > 0) entries.push({ channelId, keyframes: kfs });
            }
            copySelectedKeyframes(entries);
            return;
        }

        // Duplicate selected keyframes immediately after the selection (tiles on repeat)
        if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
            const selected = useSelectionStore.getState().selectedKeyframes;
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
                        { source: 'automation-lane', mergeKey }
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
                    { source: 'automation-lane', mergeKey }
                );
                newSelected.push({ channelId, tick: newTick });
            }

            // Shift selection to duplicated block — next Cmd+D tiles another copy
            useSelectionStore.getState().selectKeyframes(newSelected);
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
            const pasteKey = `paste-kf-${Date.now()}`;
            for (const entry of clip.entries) {
                for (const kf of entry.keyframes) {
                    const newTick = Math.max(0, Math.round(kf.tick + tickOffset));
                    dispatchSceneCommand(
                        {
                            type: 'addKeyframe',
                            channelId: entry.channelId,
                            keyframe: { ...kf, tick: newTick },
                        },
                        { source: 'automation-lane', mergeKey: pasteKey }
                    );
                }
            }
            return;
        }

        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const selected = useSelectionStore.getState().selectedKeyframes;
        if (selected.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        for (const kf of selected) {
            dispatchSceneCommand(
                { type: 'removeKeyframe', channelId: kf.channelId, tick: kf.tick },
                { source: 'automation-lane' }
            );
        }
        useSelectionStore.getState().clearSelection('keyframes');
    }, []);
    useGlobalShortcut({
        id: 'timeline.automation-keyframes',
        domain: 'timeline',
        matches: (event) =>
            ['j', 'k', 'Delete', 'Backspace'].includes(event.key) ||
            ((event.metaKey || event.ctrlKey) && ['c', 'd', 'v'].includes(event.key)),
        handle: (event) => {
            handleAutomationShortcut(event);
            return event.defaultPrevented;
        },
    });

    if (automationRows.length === 0) return null;

    const selBoxRect =
        selBox && selBox.moved
            ? {
                  x: Math.min(selBox.startX, selBox.endX),
                  y: Math.min(selBox.startY, selBox.endY),
                  width: Math.abs(selBox.endX - selBox.startX),
                  height: Math.abs(selBox.endY - selBox.startY),
              }
            : null;

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
            <div className="border-b border-neutral-800" style={{ height: AUTOMATION_HEADER_HEIGHT }} />
            {/* Search bar spacer (mirrors left-column search input row) */}
            <div className="border-b border-neutral-800" style={{ height: AUTOMATION_SEARCH_HEIGHT }} />

            {/* Scene hierarchy lane groups */}
            {visibleAutomationRows.map((row) => (
                <SceneNodeAutomationLanes key={row.nodeId} row={row} width={width} />
            ))}

            {/* Cross-lane selection box overlay */}
            {selBoxRect && (
                <div
                    className="absolute bg-blue-400/10 border border-blue-400 pointer-events-none"
                    style={{
                        left: selBoxRect.x,
                        top: selBoxRect.y,
                        width: selBoxRect.width,
                        height: selBoxRect.height,
                        zIndex: 10,
                    }}
                />
            )}
        </div>
    );
};

export default AutomationLanes;
