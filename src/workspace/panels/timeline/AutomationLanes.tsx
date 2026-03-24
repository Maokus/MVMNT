/**
 * AutomationLanes — right-column container for automation dope-sheet rows.
 *
 * Renders below track lane rows in the right column, mirroring
 * the structure of AutomationTrackLabels in the left column.
 */

import React, { useCallback, useEffect } from 'react';
import { useSceneStore } from '@state/sceneStore';
import { useAutomatedElementIds, useElementChannels, useAutomationExpanded, useCurveEditorExpanded } from '@automation/hooks';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { AUTOMATION_HEADER_HEIGHT, AUTOMATION_ROW_HEIGHT, CURVE_EDITOR_HEIGHT } from './constants';
import AutomationLaneRow from './AutomationLaneRow';
import AutomationCurvePane from './AutomationCurvePane';
import type { AutomationChannel } from '@automation/types';

/** Single channel lane + optional curve pane. */
const ChannelLane: React.FC<{ channel: AutomationChannel; width: number }> = ({ channel, width }) => {
    const curveExpanded = useCurveEditorExpanded(channel.id);

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
                    style={{ height: CURVE_EDITOR_HEIGHT }}
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

    if (!element || channels.length === 0) return null;

    return (
        <>
            {/* Element header spacer (mirrors left-column header height) */}
            <div
                className="border-b border-neutral-800"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            />

            {/* Channel lane rows (when expanded) */}
            {expanded && channels.map((ch) => (
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

    // Delete key removes selected keyframes
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const active = document.activeElement as HTMLElement | null;
            if (active) {
                const tag = active.tagName;
                if (active.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA') return;
            }
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
