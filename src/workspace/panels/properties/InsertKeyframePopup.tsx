/**
 * InsertKeyframePopup — floating search menu for quickly inserting a keyframe.
 *
 * Triggered by pressing "i" with a scene element selected. Shows a searchable
 * list of automatable properties. Selecting a property either enables automation
 * (if not yet automated) and inserts a keyframe, or adds a keyframe to an
 * existing automation channel.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { makeChannelId } from '@automation/types';
import { automationEvaluator } from '@automation/automation-evaluator';
import { useCurrentTick } from '@automation/hooks';
import { useSceneStore } from '@state/sceneStore';
import type { ConstantBindingState, ElementBindings } from '@state/sceneStore';
import { resolveAutomationValueType } from './KeyframeControl';
import type { EnhancedConfigSchema } from '@core/types';

interface AutomatableProperty {
    key: string;
    label: string;
    groupLabel: string;
    type: string;
}

interface InsertKeyframePopupProps {
    position: { x: number; y: number };
    elementId: string;
    bindings: ElementBindings;
    schema: EnhancedConfigSchema;
    onClose: () => void;
}

const InsertKeyframePopup: React.FC<InsertKeyframePopupProps> = ({
    position,
    elementId,
    bindings,
    schema,
    onClose,
}) => {
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const tick = useCurrentTick();
    const automationChannels = useSceneStore((state) => state.automation.channels);
    const propertyOverrides = useSceneStore((state) => state.propertyOverrides);

    const allProperties = useMemo<AutomatableProperty[]>(() => {
        const result: AutomatableProperty[] = [];
        for (const group of schema.groups) {
            for (const prop of group.properties) {
                if (resolveAutomationValueType(prop.type)) {
                    result.push({ key: prop.key, label: prop.label, groupLabel: group.label, type: prop.type });
                }
            }
        }
        return result;
    }, [schema]);

    const filtered = useMemo<AutomatableProperty[]>(() => {
        const q = search.toLowerCase().trim();
        if (!q) return allProperties;
        return allProperties.filter(
            (p) =>
                p.label.toLowerCase().includes(q) ||
                p.key.toLowerCase().includes(q) ||
                p.groupLabel.toLowerCase().includes(q),
        );
    }, [allProperties, search]);

    // Reset active index when filter changes
    useEffect(() => {
        setActiveIndex(0);
    }, [search]);


    // Scroll active item into view
    useEffect(() => {
        if (!listRef.current) return;
        const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const getCurrentValue = useCallback(
        (prop: AutomatableProperty): unknown => {
            const channelId = makeChannelId(elementId, prop.key);
            const isAutomated = !!automationChannels[channelId];
            if (isAutomated) {
                // Prefer override (delinked value) over curve evaluation
                const override = propertyOverrides[channelId];
                if (override !== undefined) return override;
                return automationEvaluator.evaluate(channelId, tick);
            }
            const binding = bindings[prop.key];
            if (binding?.type === 'constant') {
                return (binding as ConstantBindingState).value;
            }
            return undefined;
        },
        [elementId, bindings, automationChannels, propertyOverrides, tick],
    );

    const handleSelect = useCallback(
        (prop: AutomatableProperty) => {
            const channelId = makeChannelId(elementId, prop.key);
            const isAutomated = !!automationChannels[channelId];
            const currentValue = getCurrentValue(prop);

            if (!isAutomated) {
                const valueType = resolveAutomationValueType(prop.type);
                if (!valueType) return;
                dispatchSceneCommand(
                    {
                        type: 'enablePropertyAutomation',
                        elementId,
                        propertyKey: prop.key,
                        valueType,
                        initialKeyframes: [{ tick: tick > 0 ? tick : 0, value: currentValue, easingId: 'linear', segmentInterpolation: { mode: 'bezier' as const, direction: 'auto' as const }, leftHandleType: 'auto_clamped' as const, rightHandleType: 'auto_clamped' as const }],
                    },
                    { source: 'insert-keyframe-popup' },
                );
            } else {
                dispatchSceneCommand(
                    {
                        type: 'addKeyframe',
                        channelId,
                        keyframe: { tick, value: currentValue, easingId: 'linear', segmentInterpolation: { mode: 'bezier', direction: 'auto' }, leftHandleType: 'auto_clamped', rightHandleType: 'auto_clamped' },
                    },
                    { source: 'insert-keyframe-popup' },
                );
                // If property was delinked, clear the override to relink to automation
                if (propertyOverrides[channelId] !== undefined) {
                    useSceneStore.getState().clearPropertyOverride(channelId);
                }
            }
            onClose();
        },
        [elementId, tick, automationChannels, propertyOverrides, getCurrentValue, onClose],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const prop = filtered[activeIndex];
                if (prop) handleSelect(prop);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        },
        [filtered, activeIndex, handleSelect, onClose],
    );

    // Clamp position to stay within viewport
    const POPUP_WIDTH = 288;
    const POPUP_MAX_HEIGHT = 320;
    const x = Math.min(position.x, window.innerWidth - POPUP_WIDTH - 8);
    const y = Math.min(position.y, window.innerHeight - POPUP_MAX_HEIGHT - 8);

    return (
        <FloatingPortal>
            {/* Backdrop — click anywhere outside to close */}
            <div className="fixed inset-0 z-[999]" onMouseDown={onClose} />

            {/* Popup */}
            <div
                className="fixed z-[1000] bg-[#252526] border border-neutral-700 rounded shadow-2xl overflow-hidden"
                style={{ left: x, top: y, width: POPUP_WIDTH }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="px-3 pt-2.5 pb-2 border-b border-neutral-700/80">
                    <p className="text-[10px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider select-none">
                        Insert Keyframe
                    </p>
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="Search property…"
                        autoFocus
                        className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-[13px] text-neutral-200 placeholder-neutral-500 outline-none focus:border-sky-500 transition-colors"
                    />
                </div>

                <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-neutral-500 select-none">
                            No matching properties
                        </div>
                    ) : (
                        filtered.map((prop, i) => {
                            const isAutomated = !!automationChannels[makeChannelId(elementId, prop.key)];
                            const isActive = i === activeIndex;
                            return (
                                <button
                                    key={prop.key}
                                    type="button"
                                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${isActive ? 'bg-neutral-700/70' : 'hover:bg-neutral-700/40'
                                        }`}
                                    onMouseEnter={() => setActiveIndex(i)}
                                    onClick={() => handleSelect(prop)}
                                >
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-px ${isAutomated ? 'bg-yellow-400' : 'bg-neutral-600'
                                            }`}
                                        title={isAutomated ? 'Already automated' : 'Not yet automated'}
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="text-[13px] text-neutral-200 block truncate">{prop.label}</span>
                                        <span className="text-[11px] text-neutral-500 block truncate">{prop.groupLabel}</span>
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </FloatingPortal>
    );
};

export default InsertKeyframePopup;
