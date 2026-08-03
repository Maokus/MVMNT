/**
 * KeyframeControl — diamond-shaped toggle button for per-property automation.
 *
 * Three visual states:
 *  1. No automation (dimmed diamond)    — click enables automation & adds keyframe at current tick
 *  2. Automation, keyframe at tick (filled diamond) — click removes keyframe at current tick
 *  3. Automation, no keyframe at tick (outlined diamond) — click adds keyframe at current tick
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCurrentTick, useAutomationTargetChannel, useKeyframeAtTick } from '@automation/hooks';
import { dispatchSceneCommand, type SceneCommandOptions } from '@state/scene/commandGateway';
import { createKeyframe, elementPropertyTarget, encodePropertyOwner } from '@automation/types';
import type { AutomationValueType, PropertyTarget } from '@automation/types';
import { useTimelineStore } from '@state/timelineStore';
import { useSceneStore } from '@state/sceneStore';

interface KeyframeControlProps {
    target?: PropertyTarget;
    elementId?: string;
    propertyKey?: string;
    propertyType: string;
    currentValue: unknown;
    /** Retained for source compatibility; transient delinked overrides are no longer created. */
    isDelinked?: boolean;
}

const AUTOMATABLE_TYPES = new Set(['number', 'boolean', 'color', 'colorAlpha', 'string', 'longString', 'font']);

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
        const preview = state.transientNodeTransforms[target.owner.id];
        return Boolean(preview && typeof preview[target.propertyPath as keyof typeof preview] === 'number');
    });

    const isAutomated = channel !== null;
    const hasKeyframeHere = keyframeAtTick !== null;

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();

            if (!isAutomated) {
                // Enable automation with no initial keyframes
                const valueType = resolveAutomationValueType(propertyType);
                if (!valueType) return;

                const segInterp =
                    valueType === 'string' ? { mode: 'constant' as const, direction: 'auto' as const } : undefined;
                const initialKeyframes = [createKeyframe(tick > 0 ? tick : 0, currentValue, segInterp)];

                dispatchSceneCommand(
                    {
                        type: 'enablePropertyAutomation',
                        target,
                        valueType,
                        initialKeyframes,
                    },
                    { source: 'keyframe-control' }
                );
            } else if (hasKeyframeHere) {
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
                // Add keyframe at current tick with current value
                dispatchSceneCommand(
                    {
                        type: 'addKeyframe',
                        channelId: channelId!,
                        keyframe: createKeyframe(
                            tick,
                            currentValue,
                            channel?.valueType === 'string'
                                ? { mode: 'constant' as const, direction: 'auto' as const }
                                : undefined
                        ),
                    },
                    { source: 'keyframe-control' }
                );
            }
            if (target.owner.kind === 'node') {
                useSceneStore.getState().clearTransientNodeTransforms([target.owner.id], [target.propertyPath as any]);
            }
        },
        [isAutomated, hasKeyframeHere, channelId, tick, currentValue, target, propertyType]
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

    useEffect(() => {
        if (!menuPosition) return;
        const close = () => setMenuPosition(null);
        window.addEventListener('pointerdown', close);
        window.addEventListener('blur', close);
        return () => {
            window.removeEventListener('pointerdown', close);
            window.removeEventListener('blur', close);
        };
    }, [menuPosition]);

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
            useSceneStore.setState((current) => ({
                interaction: {
                    ...current.interaction,
                    automationExpandedOwners: [
                        ...current.interaction.automationExpandedOwners.filter(
                            (key) => key !== nodeId && key !== ownerKey
                        ),
                        ownerKey,
                    ],
                    automationSearchQuery: '',
                },
            }));
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
            {menuPosition
                ? createPortal(
                      <div
                          className="ae-keyframe-menu"
                          role="menu"
                          style={{ left: menuPosition.x, top: menuPosition.y }}
                          onPointerDown={(event) => event.stopPropagation()}
                      >
                          <button type="button" role="menuitem" onClick={() => seekAdjacent(-1)}>
                              Previous keyframe
                          </button>
                          <button type="button" role="menuitem" onClick={() => seekAdjacent(1)}>
                              Next keyframe
                          </button>
                          <button type="button" role="menuitem" onClick={revealInTimeline}>
                              Reveal in timeline
                          </button>
                          <div className="ae-keyframe-menu-divider" />
                          <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => {
                                  dispatchSceneCommand(
                                      { type: 'disablePropertyAutomation', target },
                                      { source: 'keyframe-control' }
                                  );
                                  setMenuPosition(null);
                              }}
                          >
                              Disable automation
                          </button>
                      </div>,
                      document.body
                  )
                : null}
        </>
    );
};

export default KeyframeControl;
