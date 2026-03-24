import React, { useCallback } from 'react';
import { FaChevronDown, FaChevronRight, FaTimes } from 'react-icons/fa';
import { useSceneStore } from '@state/sceneStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { useAutomatedElementIds, useElementChannels, useAutomationExpanded } from '@automation/hooks';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT } from './constants';

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
                <div
                    key={ch.id}
                    className="flex items-center justify-between gap-1 pl-6 pr-2 border-b border-neutral-800/60 text-neutral-400 hover:bg-neutral-800/30"
                    style={{ height: AUTOMATION_ROW_HEIGHT }}
                >
                    <span className="text-[11px] truncate">{ch.propertyKey}</span>
                    <button
                        className="flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-red-400 hover:bg-red-900/30"
                        title={`Remove automation: ${ch.propertyKey}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            dispatchSceneCommand({
                                type: 'disablePropertyAutomation',
                                elementId: ch.elementId,
                                propertyKey: ch.propertyKey,
                            });
                        }}
                    >
                        <FaTimes className="text-[8px]" />
                    </button>
                </div>
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
