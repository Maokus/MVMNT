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
import { makeChannelId, createKeyframe } from '@automation/types';
import type { AutomationValueType } from '@automation/types';
import { useSceneStore } from '@state/sceneStore';

interface KeyframeControlProps {
    elementId: string;
    propertyKey: string;
    propertyType: string;
    currentValue: unknown;
    isDelinked?: boolean;
}

const AUTOMATABLE_TYPES = new Set(['number', 'range', 'boolean', 'color', 'colorAlpha', 'string', 'longString', 'font']);

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
        case 'string':
        case 'longString':
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
    propertyType,
    currentValue,
    isDelinked = false,
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

                const segInterp = valueType === 'string'
                    ? { mode: 'constant' as const, direction: 'auto' as const }
                    : undefined;
                const initialKeyframes = [
                    createKeyframe(tick > 0 ? tick : 0, currentValue, segInterp),
                ];


                dispatchSceneCommand(
                    {
                        type: 'enablePropertyAutomation',
                        elementId,
                        propertyKey,
                        valueType,
                        initialKeyframes,
                    },
                    { source: 'keyframe-control' },
                );
            } else if (hasKeyframeHere && !isDelinked) {
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
                        keyframe: createKeyframe(tick, currentValue, channel?.valueType === 'string' ? { mode: 'constant' as const, direction: 'auto' as const } : undefined),
                    },
                    { source: 'keyframe-control' },
                );
                // If property was delinked (override shadowing automation), clear the override to relink
                if (isDelinked) {
                    useSceneStore.getState().clearPropertyOverride(makeChannelId(elementId, propertyKey));
                }
            }
        },
        [isAutomated, hasKeyframeHere, channelId, tick, currentValue, elementId, propertyKey, propertyType, isDelinked],
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
        : hasKeyframeHere && !isDelinked
            ? 'Remove keyframe at current tick'
            : 'Add keyframe at current tick';

    const stateClass = !isAutomated ? 'inactive' : (hasKeyframeHere && !isDelinked) ? 'active' : 'automated';

    return (
        <button
            type="button"
            className={`ae-keyframe-toggle ${stateClass}`}
            title={title}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
        >
            {!isAutomated ? (
                <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-stopwatch">
                    {/* Crown button */}
                    <rect x="3.5" y="0.5" width="3" height="1.2" rx="0.6" fill="currentColor" />
                    {/* Stem */}
                    <line x1="5" y1="1.7" x2="5" y2="2.8" stroke="currentColor" strokeWidth="1" />
                    {/* Face */}
                    <circle cx="5" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1" />
                    {/* Hour hand */}
                    <line x1="5" y1="6" x2="5" y2="4" stroke="currentColor" strokeWidth="1" />
                    {/* Minute hand */}
                    <line x1="5" y1="6" x2="7" y2="6" stroke="currentColor" strokeWidth="1" />
                </svg>
            ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" className="ae-keyframe-diamond">
                    <path d="M5 0 L10 5 L5 10 L0 5 Z" />
                </svg>
            )}
        </button>
    );
};

export default KeyframeControl;
