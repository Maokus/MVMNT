/**
 * KeyframeControl — diamond-shaped toggle button for per-property automation.
 *
 * Three visual states:
 *  1. No automation (dimmed diamond)    — click enables automation & adds keyframe at current tick
 *  2. Automation, keyframe at tick (filled diamond) — click removes keyframe at current tick
 *  3. Automation, no keyframe at tick (outlined diamond) — click adds keyframe at current tick
 */

import React, { useCallback } from 'react';
import { useCurrentTick, useAutomationChannel, useKeyframeAtTick } from '@automation/hooks';
import { dispatchSceneCommand, type SceneCommandOptions } from '@state/scene/commandGateway';
import { makeChannelId } from '@automation/types';
import type { AutomationValueType } from '@automation/types';

interface KeyframeControlProps {
    elementId: string;
    propertyKey: string;
    propertyType: string;
    currentValue: unknown;
}

const AUTOMATABLE_TYPES = new Set(['number', 'range', 'boolean', 'color', 'colorAlpha']);

/** Map a PropertyDefinition.type to an AutomationValueType. Returns null if not automatable. */
export function resolveAutomationValueType(propertyType: string): AutomationValueType | null {
    switch (propertyType) {
        case 'number':
        case 'range':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'color':
        case 'colorAlpha':
            return 'color';
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
    propertyType,
    currentValue,
}) => {
    const tick = useCurrentTick();
    const channel = useAutomationChannel(elementId, propertyKey);
    const channelId = channel?.id ?? null;
    const keyframeAtTick = useKeyframeAtTick(channelId, tick);

    const isAutomated = channel !== null;
    const hasKeyframeHere = keyframeAtTick !== null;

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();

            if (!isAutomated) {
                // Enable automation with no initial keyframes
                const valueType = resolveAutomationValueType(propertyType);
                if (!valueType) return;

                dispatchSceneCommand(
                    {
                        type: 'enablePropertyAutomation',
                        elementId,
                        propertyKey,
                        valueType,
                    },
                    { source: 'keyframe-control' },
                );
            } else if (hasKeyframeHere) {
                // Remove keyframe at current tick
                dispatchSceneCommand(
                    {
                        type: 'removeKeyframe',
                        channelId: channelId!,
                        tick,
                    },
                    { source: 'keyframe-control' },
                );
            } else {
                // Add keyframe at current tick with current value
                dispatchSceneCommand(
                    {
                        type: 'addKeyframe',
                        channelId: channelId!,
                        keyframe: { tick, value: currentValue, easingId: 'linear' },
                    },
                    { source: 'keyframe-control' },
                );
            }
        },
        [isAutomated, hasKeyframeHere, channelId, tick, currentValue, elementId, propertyKey, propertyType],
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (!isAutomated) return;

            // Disable automation (revert to constant)
            dispatchSceneCommand(
                {
                    type: 'disablePropertyAutomation',
                    elementId,
                    propertyKey,
                },
                { source: 'keyframe-control' },
            );
        },
        [isAutomated, elementId, propertyKey],
    );

    const title = !isAutomated
        ? 'Enable automation'
        : hasKeyframeHere
            ? 'Remove keyframe at current tick'
            : 'Add keyframe at current tick';

    const stateClass = !isAutomated ? 'inactive' : hasKeyframeHere ? 'active' : 'automated';

    return (
        <button
            type="button"
            className={`ae-keyframe-toggle ${stateClass}`}
            title={title}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
        >
            <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-diamond">
                <path d="M5 0 L10 5 L5 10 L0 5 Z" />
            </svg>
        </button>
    );
};

export default KeyframeControl;
