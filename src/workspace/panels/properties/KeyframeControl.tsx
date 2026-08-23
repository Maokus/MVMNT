/**
 * KeyframeControl — diamond-shaped toggle button for per-property automation.
 *
 * Three visual states:
 *  1. No automation (dimmed diamond)    — click enables automation & adds keyframe at current tick
 *  2. Automation, keyframe at tick (filled diamond) — click removes keyframe at current tick
 *  3. Automation, no keyframe at tick (outlined diamond) — click adds keyframe at current tick
 */

import React, { useCallback, useState } from 'react';
import { useCurrentTick, useAutomationTargetChannel, useKeyframeAtTick } from '@automation/hooks';
import { dispatchSceneCommand, insertPropertyKeyframe } from '@state/scene';
import { elementPropertyTarget, encodePropertyOwner } from '@automation/types';
import type { AutomationValueType, PropertyTarget } from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { CommandContextMenu } from '@workspace/components/CommandContextMenu';

interface KeyframeControlProps {
    target?: PropertyTarget;
    elementId?: string;
    propertyKey?: string;
    propertyType: string;
    currentValue: unknown;
    /** Retained for source compatibility; transient delinked overrides are no longer created. */
    isDelinked?: boolean;
}

const AUTOMATABLE_TYPES = new Set([
    'number',
    'boolean',
    'color',
    'colorAlpha',
    'string',
    'longString',
    'select',
    'font',
]);

/** Map a PropertyDefinition.type to an AutomationValueType. Returns null if not automatable. */
export function resolveAutomationValueType(propertyType: string): AutomationValueType | null {
    switch (propertyType) {
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'color':
        case 'colorAlpha':
            return 'color';
        case 'string':
        case 'longString':
        case 'select':
        case 'font':
            return 'string';
        default:
            return null;
    }
}

export function isAutomatableType(propertyType: string): boolean {
    return AUTOMATABLE_TYPES.has(propertyType);
}

const KeyframeControl: React.FC<KeyframeControlProps> = ({
    elementId,
    propertyKey,
    target: explicitTarget,
    propertyType,
    currentValue,
}) => {
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const target = explicitTarget ?? elementPropertyTarget(elementId!, propertyKey!);
    const tick = useCurrentTick();
    const channel = useAutomationTargetChannel(target);
    const channelId = channel?.id ?? null;
    const keyframeAtTick = useKeyframeAtTick(channelId, tick);
    const hasUncommittedPreview = useSceneStore((state) => {
        if (target.owner.kind !== 'node') return false;
        const preview = useSceneEditorStore.getState().transientNodeTransforms[target.owner.id];
        return Boolean(preview && typeof preview[target.propertyPath as keyof typeof preview] === 'number');
    });

    const isAutomated = channel !== null;
    const hasKeyframeHere = keyframeAtTick !== null;

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();

            // A pending pose is an explicit request to key the displayed value,
            // even if this control has not yet re-rendered after a scrub.
            if (isAutomated && hasKeyframeHere && !hasUncommittedPreview) {
                // Remove keyframe at current tick
                dispatchSceneCommand(
                    {
                        type: 'removeKeyframe',
                        channelId: channelId!,
                        tick,
                    },
                    { source: 'keyframe-control' }
                );
            } else {
                const valueType = resolveAutomationValueType(propertyType);
                if (!valueType) return;
                insertPropertyKeyframe(target, valueType, tick, 'keyframe-control', currentValue);
            }
        },
        [isAutomated, hasKeyframeHere, hasUncommittedPreview, channelId, tick, currentValue, target, propertyType]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isAutomated) return;
            setMenuPosition({ x: e.clientX, y: e.clientY });
        },
        [isAutomated]
    );

    const seekAdjacent = (direction: -1 | 1) => {
        if (!channel) return;
        const ticks = channel.keyframes.map((keyframe) => keyframe.tick).sort((a, b) => a - b);
        const adjacent =
            direction < 0
                ? [...ticks].reverse().find((keyframeTick) => keyframeTick < tick - 0.5)
                : ticks.find((keyframeTick) => keyframeTick > tick + 0.5);
        if (adjacent !== undefined) useTimelineStore.getState().seekTick(adjacent);
        setMenuPosition(null);
    };

    const revealInTimeline = () => {
        if (!channel) return;
        const state = useSceneStore.getState();
        const nodeId = target.owner.kind === 'node' ? target.owner.id : state.nodeIdByElementId[target.owner.id];
        if (nodeId) {
            const ownerKey = encodePropertyOwner({ kind: 'node', id: nodeId });
            const editor = useSceneEditorStore.getState();
            editor.setAutomationExpandedOwners([
                ...editor.automationExpandedOwners.filter((key) => key !== nodeId && key !== ownerKey),
                ownerKey,
            ]);
            editor.setAutomationSearchQuery('');
            requestAnimationFrame(() =>
                document.querySelector<HTMLElement>(`[data-channel-id="${channel.id}"]`)?.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth',
                })
            );
        }
        setMenuPosition(null);
    };

    const title = hasUncommittedPreview
        ? 'Commit uncommitted keyframe at current tick'
        : !isAutomated
          ? 'Enable automation'
          : hasKeyframeHere
            ? 'Remove keyframe at current tick'
            : 'Add keyframe at current tick';

    const stateClass = hasUncommittedPreview
        ? 'uncommitted'
        : !isAutomated
          ? 'inactive'
          : hasKeyframeHere
            ? 'active'
            : 'automated';

    return (
        <>
            <button
                type="button"
                className={`ae-keyframe-toggle ${stateClass}`}
                title={`${title}${isAutomated ? ' · Right-click for automation menu' : ''}`}
                aria-label={title}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            >
                {!isAutomated ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-stopwatch">
                        <rect x="3.5" y="0.5" width="3" height="1.2" rx="0.6" fill="currentColor" />
                        <line x1="5" y1="1.7" x2="5" y2="2.8" stroke="currentColor" strokeWidth="1" />
                        <circle cx="5" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" />
                        <line x1="5" y1="6" x2="5" y2="4" stroke="currentColor" strokeWidth="1" />
                        <line x1="5" y1="6" x2="7" y2="6" stroke="currentColor" strokeWidth="1" />
                    </svg>
                ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-diamond">
                        <path d="M5 0 L10 5 L5 10 L0 5 Z" />
                    </svg>
                )}
            </button>
            {menuPosition ? (
                <CommandContextMenu
                    position={menuPosition}
                    onClose={() => setMenuPosition(null)}
                    ariaLabel="Property automation actions"
                    entries={[
                        { label: 'Previous keyframe', onSelect: () => seekAdjacent(-1) },
                        { label: 'Next keyframe', onSelect: () => seekAdjacent(1) },
                        { label: 'Reveal in timeline', onSelect: revealInTimeline },
                        { separator: true },
                        {
                            label: 'Disable automation',
                            danger: true,
                            onSelect: () =>
                                dispatchSceneCommand(
                                    { type: 'disablePropertyAutomation', target },
                                    { source: 'keyframe-control' }
                                ),
                        },
                    ]}
                />
            ) : null}
        </>
    );
};

export default KeyframeControl;
