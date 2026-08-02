import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaChevronDown,
    FaChevronRight,
    FaTimes,
    FaChartLine,
    FaAngleLeft,
    FaAngleRight,
    FaSearch,
} from 'react-icons/fa';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useAutomationSceneNodes, useAutomationExpanded, useCurveEditorExpanded } from '@automation/hooks';
import { useSelectionStore } from '@state/selectionStore';
import { encodePropertyOwner } from '@automation/types';
import type { AutomatedSceneNodeView } from '@automation/selectors';
import { descriptorForTarget, fallbackDescriptor } from '@state/scene/propertyCatalog';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT, AUTOMATION_SEARCH_HEIGHT } from '../constants';
import { useCurveHeight } from '../context/curveHeightContext';
import { useCurveRange, useCurveRangeControls } from '../context/curveRangeContext';
import { computeAutoRange } from './automationCurveUtils';

/** Range controls shown in the left-column spacer when the curve editor is open. */
const CurveRangeControls: React.FC<{ channelId: string; curveHeight: number }> = ({ channelId, curveHeight }) => {
    const { autoRange, manualMin, manualMax } = useCurveRange(channelId);
    const { setAutoRange, setManualRange, displayedRefs } = useCurveRangeControls();
    const channel = useSceneStore(useCallback((s) => s.automation.channels[channelId], [channelId]));

    // When in auto mode, compute the range directly from keyframes so the labels are
    // correct immediately on first render (before the animation RAF has populated displayedRefs).
    const { autoDisplayMin, autoDisplayMax } = useMemo(() => {
        if (!channel) return { autoDisplayMin: manualMin, autoDisplayMax: manualMax };
        const { minVal, maxVal } = computeAutoRange(channel);
        return { autoDisplayMin: minVal, autoDisplayMax: maxVal };
    }, [channel, manualMin, manualMax]);

    const [minText, setMinText] = useState(() => manualMin.toFixed(2));
    const [maxText, setMaxText] = useState(() => manualMax.toFixed(2));

    // Track input focus so we don't overwrite text the user is actively editing.
    const minFocusedRef = useRef(false);
    const maxFocusedRef = useRef(false);

    // Sync display text when manualMin/manualMax change from external sources (e.g. scroll panning).
    useEffect(() => {
        if (!minFocusedRef.current) setMinText(manualMin.toFixed(2));
    }, [manualMin]);
    useEffect(() => {
        if (!maxFocusedRef.current) setMaxText(manualMax.toFixed(2));
    }, [manualMax]);

    const commitMin = useCallback(
        (text: string) => {
            const v = parseFloat(text);
            if (!isNaN(v)) {
                setManualRange(channelId, v, manualMax);
                setMinText(v.toFixed(2));
            } else {
                setMinText(manualMin.toFixed(2));
            }
        },
        [channelId, manualMin, manualMax, setManualRange]
    );

    const commitMax = useCallback(
        (text: string) => {
            const v = parseFloat(text);
            if (!isNaN(v)) {
                setManualRange(channelId, manualMin, v);
                setMaxText(v.toFixed(2));
            } else {
                setMaxText(manualMax.toFixed(2));
            }
        },
        [channelId, manualMin, manualMax, setManualRange]
    );

    const handleToggleAuto = useCallback(() => {
        if (autoRange) {
            // switching to manual — seed from current animated values if available, else from computed auto range
            const displayed = displayedRefs.current[channelId];
            const seedMin = displayed?.min ?? autoDisplayMin;
            const seedMax = displayed?.max ?? autoDisplayMax;
            setMinText(seedMin.toFixed(2));
            setMaxText(seedMax.toFixed(2));
            setManualRange(channelId, seedMin, seedMax);
        } else {
            setAutoRange(channelId, true);
        }
    }, [autoRange, channelId, autoDisplayMin, autoDisplayMax, displayedRefs, setAutoRange, setManualRange]);

    // Sync display text when autoRange is re-enabled
    const prevAutoRange = React.useRef(autoRange);
    if (prevAutoRange.current !== autoRange) {
        prevAutoRange.current = autoRange;
        if (autoRange) {
            const displayed = displayedRefs.current[channelId];
            if (displayed) {
                setMinText(displayed.min.toFixed(2));
                setMaxText(displayed.max.toFixed(2));
            }
        }
    }

    const inputStyle = (disabled: boolean): React.CSSProperties => ({
        width: 44,
        fontSize: 9,
        padding: '1px 3px',
        background: 'rgba(0,0,0,0.4)',
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 3,
        color: disabled ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)',
        textAlign: 'right' as const,
        outline: 'none',
    });

    return (
        <div
            className="border-b border-neutral-800/60 bg-neutral-900/30 flex flex-col items-center justify-center py-1"
            style={{ height: curveHeight, width: '100%' }}
        >
            <div>
                {/* Min input */}
                <input
                    type="text"
                    style={inputStyle(autoRange)}
                    value={autoRange ? autoDisplayMin.toFixed(2) : minText}
                    readOnly={autoRange}
                    onChange={(e) => {
                        if (!autoRange) setMinText(e.target.value);
                    }}
                    onFocus={(e) => {
                        minFocusedRef.current = true;
                        if (!autoRange) e.currentTarget.select();
                    }}
                    onBlur={(e) => {
                        minFocusedRef.current = false;
                        if (!autoRange) commitMin(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                        if (!autoRange && e.key === 'Enter') {
                            commitMin((e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                />
                -{/* Max input */}
                <input
                    type="text"
                    style={inputStyle(autoRange)}
                    value={autoRange ? autoDisplayMax.toFixed(2) : maxText}
                    readOnly={autoRange}
                    onChange={(e) => {
                        if (!autoRange) setMaxText(e.target.value);
                    }}
                    onFocus={(e) => {
                        maxFocusedRef.current = true;
                        if (!autoRange) e.currentTarget.select();
                    }}
                    onBlur={(e) => {
                        maxFocusedRef.current = false;
                        if (!autoRange) commitMax(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                        if (!autoRange && e.key === 'Enter') {
                            commitMax((e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                />
                {/* Auto toggle button */}
                <button
                    type="button"
                    style={{
                        fontSize: 9,
                        padding: '1px 6px',
                        borderRadius: 3,
                        border: `1px solid ${autoRange ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.15)'}`,
                        background: autoRange ? 'rgba(96,165,250,0.2)' : 'rgba(0,0,0,0.4)',
                        color: autoRange ? '#93c5fd' : 'rgba(255,255,255,0.45)',
                        cursor: 'pointer',
                        lineHeight: 1.5,
                        userSelect: 'none',
                        marginLeft: '6px',
                    }}
                    onClick={handleToggleAuto}
                >
                    auto
                </button>
            </div>
        </div>
    );
};

/** Channel row label with curve toggle and remove button. */
const ChannelRow: React.FC<{ channelId: string }> = ({ channelId }) => {
    const curveExpanded = useCurveEditorExpanded(channelId);
    const channel = useSceneStore(useCallback((s) => s.automation.channels[channelId], [channelId]));
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const seekTick = useTimelineStore((s) => s.seekTick);
    const curveHeight = useCurveHeight(channelId);
    const propertyPath = channel?.target.propertyPath ?? '';
    const elementType = useSceneStore(
        useCallback(
            (state) =>
                channel?.target.owner.kind === 'element' ? state.elements[channel.target.owner.id]?.type : undefined,
            [channel]
        )
    );
    const descriptor = channel
        ? (descriptorForTarget(channel.target, elementType) ?? fallbackDescriptor(channel.target, channel.valueType))
        : null;

    const toggleCurve = useCallback(() => {
        useSceneStore.setState((state) => {
            const list = state.interaction.automationExpandedCurves;
            const next = curveExpanded ? list.filter((id) => id !== channelId) : [...list, channelId];
            return {
                interaction: { ...state.interaction, automationExpandedCurves: next },
            };
        });
    }, [channelId, curveExpanded]);

    const goPrevKeyframe = useCallback(() => {
        if (!channel) return;
        const ticks = channel.keyframes.map((kf) => kf.tick).sort((a, b) => a - b);
        const prev = [...ticks].reverse().find((t) => t < currentTick - 0.5);
        if (prev !== undefined) seekTick(prev);
    }, [channel, currentTick, seekTick]);

    const goNextKeyframe = useCallback(() => {
        if (!channel) return;
        const ticks = channel.keyframes.map((kf) => kf.tick).sort((a, b) => a - b);
        const next = ticks.find((t) => t > currentTick + 0.5);
        if (next !== undefined) seekTick(next);
    }, [channel, currentTick, seekTick]);

    return (
        <>
            <div
                className="flex items-center justify-between gap-1 pl-6 pr-2 border-b border-neutral-800/60 text-neutral-400 hover:bg-neutral-800/30"
                style={{ height: AUTOMATION_ROW_HEIGHT }}
                onDoubleClick={toggleCurve}
            >
                <span className="text-[11px] truncate" title={propertyPath}>
                    <span className="text-neutral-500 mr-1">
                        {channel?.target.owner.kind === 'node' ? 'Host' : 'Content'}
                    </span>
                    {descriptor?.definition.label ?? propertyPath}
                    {descriptor?.presentation.unit ?? ''}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        className="flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50"
                        title="Previous keyframe (J)"
                        onClick={(e) => {
                            e.stopPropagation();
                            goPrevKeyframe();
                        }}
                    >
                        <FaAngleLeft className="text-[8px]" />
                    </button>
                    <button
                        className="flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50"
                        title="Next keyframe (K)"
                        onClick={(e) => {
                            e.stopPropagation();
                            goNextKeyframe();
                        }}
                    >
                        <FaAngleRight className="text-[8px]" />
                    </button>
                    {channel?.valueType !== 'string' && (
                        <button
                            className={`flex items-center justify-center w-4 h-4 rounded ${
                                curveExpanded
                                    ? 'text-blue-400 bg-blue-900/30'
                                    : 'text-neutral-500 hover:text-blue-400 hover:bg-blue-900/20'
                            }`}
                            title={curveExpanded ? 'Hide curve editor' : 'Show curve editor'}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleCurve();
                            }}
                        >
                            <FaChartLine className="text-[8px]" />
                        </button>
                    )}
                    <button
                        className="flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-red-400 hover:bg-red-900/30"
                        title={`Remove automation: ${propertyPath}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            dispatchSceneCommand({
                                type: 'disablePropertyAutomation',
                                target: channel?.target,
                            });
                        }}
                    >
                        <FaTimes className="text-[8px]" />
                    </button>
                </div>
            </div>
            {/* Curve editor spacer in left column — height synced with right-column curve pane */}
            {curveExpanded && channel?.valueType !== 'string' && (
                <CurveRangeControls channelId={channelId} curveHeight={curveHeight} />
            )}
        </>
    );
};

/** A scene-node row containing both host and element-content automation. */
const SceneNodeAutomationGroup: React.FC<{ row: AutomatedSceneNodeView }> = ({ row }) => {
    const owner = { kind: 'node' as const, id: row.nodeId };
    const ownerKey = encodePropertyOwner(owner);
    const expanded = useAutomationExpanded(owner);
    const channels = [...row.hostChannels, ...row.contentChannels];
    const searchQuery = useSceneStore((s) => s.interaction.automationSearchQuery);
    const treeExpanded = useSelectionStore((state) => state.expandedNodeIds[row.nodeId] !== false);
    const toggleTreeExpanded = useSelectionStore((state) => state.toggleNodeExpanded);

    const toggleExpanded = useCallback(() => {
        useSceneStore.setState((state) => {
            const list = state.interaction.automationExpandedOwners;
            const next = expanded
                ? list.filter((id) => id !== ownerKey && id !== row.nodeId)
                : [...list.filter((id) => id !== row.nodeId), ownerKey];
            return {
                interaction: { ...state.interaction, automationExpandedOwners: next },
            };
        });
    }, [expanded, ownerKey, row.nodeId]);

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

    return (
        <>
            <div
                className="flex items-center gap-1.5 px-2 border-b border-neutral-800 cursor-pointer select-none text-neutral-300 hover:bg-neutral-800/40"
                style={{ height: AUTOMATION_HEADER_HEIGHT, paddingLeft: row.depth * 12 + 8 }}
                onClick={() => {
                    const selection = useSelectionStore.getState();
                    if (selection.selectedNodeIds.includes(row.nodeId)) {
                        selection.selectSceneNodes(selection.selectedNodeIds, row.nodeId);
                    } else {
                        selection.selectSceneNodes([row.nodeId], row.nodeId);
                    }
                }}
                title="Select scene node"
            >
                {row.kind === 'group' ? (
                    <button
                        type="button"
                        className="flex items-center justify-center w-3 h-4"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleTreeExpanded(row.nodeId);
                        }}
                        title={treeExpanded ? 'Collapse descendants' : 'Expand descendants'}
                    >
                        {treeExpanded ? (
                            <FaChevronDown className="text-[9px]" />
                        ) : (
                            <FaChevronRight className="text-[9px]" />
                        )}
                    </button>
                ) : (
                    <span className="w-3" />
                )}
                <span className="text-[11px] font-medium truncate">{row.name}</span>
                <span className="text-[9px] text-neutral-600">{row.kind === 'group' ? 'Group' : 'Element'}</span>
                <span className="text-[10px] text-neutral-500 truncate">({visibleChannels.length})</span>
                {visibleChannels.length ? (
                    <button
                        type="button"
                        className="ml-auto flex items-center justify-center w-3 h-4"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleExpanded();
                        }}
                        title={isExpanded ? 'Collapse property channels' : 'Expand property channels'}
                    >
                        {isExpanded ? (
                            <FaChevronDown className="text-[9px]" />
                        ) : (
                            <FaChevronRight className="text-[9px]" />
                        )}
                    </button>
                ) : null}
            </div>

            {/* Channel rows (when expanded) */}
            {isExpanded && visibleChannels.map((ch) => <ChannelRow key={ch.id} channelId={ch.id} />)}
        </>
    );
};

/** Left-column labels for the automation section, rendered below track rows. */
const AutomationTrackLabels: React.FC = () => {
    const automationRows = useAutomationSceneNodes();
    const expandedSceneNodes = useSelectionStore((state) => state.expandedNodeIds);
    const searchQuery = useSceneStore((s) => s.interaction.automationSearchQuery);
    const visibleAutomationRows = searchQuery.trim()
        ? automationRows
        : automationRows.filter((row) =>
              row.ancestorNodeIds.every((ancestorId) => expandedSceneNodes[ancestorId] !== false)
          );

    if (automationRows.length === 0) return null;

    const setSearchQuery = (q: string) => {
        useSceneStore.setState((s) => ({
            interaction: { ...s.interaction, automationSearchQuery: q },
        }));
    };

    return (
        <div className="automation-labels border-t border-neutral-700">
            {/* Section header */}
            <div
                className="flex items-center px-2 border-b border-neutral-800 bg-neutral-900/60 text-neutral-500"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            >
                <span className="text-[10px] font-semibold uppercase tracking-wider flex-1">Automation</span>
            </div>

            {/* Search bar */}
            <div
                className="flex items-center gap-1 px-2 border-b border-neutral-800 bg-neutral-900/40"
                style={{ height: AUTOMATION_SEARCH_HEIGHT }}
            >
                <FaSearch className="text-[9px] text-neutral-500 shrink-0" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter properties…"
                    className="flex-1 bg-transparent text-[11px] text-neutral-300 placeholder-neutral-600 outline-none min-w-0"
                />
                {searchQuery && (
                    <button className="text-neutral-500 hover:text-neutral-200" onClick={() => setSearchQuery('')}>
                        <FaTimes className="text-[9px]" />
                    </button>
                )}
            </div>

            {/* Scene hierarchy groups */}
            {visibleAutomationRows.map((row) => (
                <SceneNodeAutomationGroup key={row.nodeId} row={row} />
            ))}
        </div>
    );
};

export default AutomationTrackLabels;
