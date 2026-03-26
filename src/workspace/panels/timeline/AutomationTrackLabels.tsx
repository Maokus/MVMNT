import React, { useCallback } from 'react';
import { FaChevronDown, FaChevronRight, FaTimes, FaChartLine, FaAngleLeft, FaAngleRight } from 'react-icons/fa';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useAutomatedElementIds, useElementChannels, useAutomationExpanded, useCurveEditorExpanded } from '@automation/hooks';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT } from './constants';
import { useCurveHeight } from './curveHeightContext';

/** Channel row label with curve toggle and remove button. */
const ChannelRow: React.FC<{ channelId: string; elementId: string; propertyKey: string }> = ({
    channelId,
    elementId,
    propertyKey,
}) => {
    const curveExpanded = useCurveEditorExpanded(channelId);
    const channel = useSceneStore(useCallback((s) => s.automation.channels[channelId], [channelId]));
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const seekTick = useTimelineStore((s) => s.seekTick);
    const curveHeight = useCurveHeight(channelId);

    const toggleCurve = useCallback(() => {
        useSceneStore.setState((state) => {
            const list = state.interaction.automationExpandedCurves;
            const next = curveExpanded
                ? list.filter((id) => id !== channelId)
                : [...list, channelId];
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
            >
                <span className="text-[11px] truncate">{propertyKey}</span>
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
                    <button
                        className={`flex items-center justify-center w-4 h-4 rounded ${curveExpanded
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
                    <button
                        className="flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-red-400 hover:bg-red-900/30"
                        title={`Remove automation: ${propertyKey}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            dispatchSceneCommand({
                                type: 'disablePropertyAutomation',
                                elementId,
                                propertyKey,
                            });
                        }}
                    >
                        <FaTimes className="text-[8px]" />
                    </button>
                </div>
            </div>
            {/* Curve editor spacer in left column — height synced with right-column curve pane */}
            {curveExpanded && (
                <div
                    className="border-b border-neutral-800/60 bg-neutral-900/30 flex items-center px-6"
                    style={{ height: curveHeight }}
                >
                    <span className="text-[9px] text-neutral-500">Curve</span>
                </div>
            )}
        </>
    );
};

/** A single element's automation label group. */
const ElementAutomationGroup: React.FC<{ elementId: string }> = ({ elementId }) => {
    const element = useSceneStore(useCallback((s) => s.elements[elementId], [elementId]));
    const expanded = useAutomationExpanded(elementId);
    const channels = useElementChannels(elementId);

    const toggleExpanded = useCallback(() => {
        useSceneStore.setState((state) => {
            const list = state.interaction.automationExpandedElements;
            const next = expanded
                ? list.filter((id) => id !== elementId)
                : [...list, elementId];
            return {
                interaction: { ...state.interaction, automationExpandedElements: next },
            };
        });
    }, [elementId, expanded]);

    if (!element || channels.length === 0) return null;

    return (
        <>
            {/* Element header row */}
            <div
                className="flex items-center gap-1.5 px-2 border-b border-neutral-800 cursor-pointer select-none text-neutral-300 hover:bg-neutral-800/40"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
                onClick={toggleExpanded}
                title={expanded ? 'Collapse automation channels' : 'Expand automation channels'}
            >
                {expanded ? <FaChevronDown className="text-[9px]" /> : <FaChevronRight className="text-[9px]" />}
                <span className="text-[11px] font-medium truncate">{element.type}</span>
                <span className="text-[10px] text-neutral-500 truncate">({channels.length})</span>
            </div>

            {/* Channel rows (when expanded) */}
            {expanded && channels.map((ch) => (
                <ChannelRow
                    key={ch.id}
                    channelId={ch.id}
                    elementId={ch.elementId}
                    propertyKey={ch.propertyKey}
                />
            ))}
        </>
    );
};

/** Left-column labels for the automation section, rendered below track rows. */
const AutomationTrackLabels: React.FC = () => {
    const automatedIds = useAutomatedElementIds();

    if (automatedIds.length === 0) return null;

    return (
        <div className="automation-labels border-t border-neutral-700">
            {/* Section header */}
            <div
                className="flex items-center px-2 border-b border-neutral-800 bg-neutral-900/60 text-neutral-500"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            >
                <span className="text-[10px] font-semibold uppercase tracking-wider">Automation</span>
            </div>

            {/* Element groups */}
            {automatedIds.map((id) => (
                <ElementAutomationGroup key={id} elementId={id} />
            ))}
        </div>
    );
};

export default AutomationTrackLabels;
