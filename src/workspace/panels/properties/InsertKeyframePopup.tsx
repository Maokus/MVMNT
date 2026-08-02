/**
 * InsertKeyframePopup — floating search menu for quickly inserting a keyframe.
 *
 * Triggered by pressing "i" with a scene node selected. Shows a searchable
 * list of node transforms and element properties. Selecting a property either enables automation
 * (if not yet automated) and inserts a keyframe, or adds a keyframe to an
 * existing automation channel.
 *
 * Shortcut presets (All Transforms, Translation, Pivot, Scales) appear at the top and
 * insert keyframes for multiple properties at once.
 *
 * Property aliases promote a specific property to first result:
 *   x/y → node translation, r → node rotation, s → node scale,
 *   px/py → node pivot, sx/sy → element scale, t → opacity
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { channelForTarget, createKeyframe, elementPropertyTarget } from '@automation/types';
import type { AutomationValueType, PropertyTarget } from '@automation/types';
import { useCurrentTick } from '@automation/hooks';
import { useSceneStore } from '@state/sceneStore';
import { resolveAutomationValueType } from './KeyframeControl';
import type { EnhancedConfigSchema } from '@core/types';
import { effectiveValueForTarget } from '@state/scene/propertyEditing';
import { hostPropertyDescriptors } from '@state/scene/propertyCatalog';

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

/** Maps a shortcut alias to the stable property ID it should promote to first result. */
const PROPERTY_ALIASES: Record<string, string> = {
    x: 'node:translationX',
    y: 'node:translationY',
    r: 'node:rotation',
    s: 'node:scaleX',
    px: 'node:pivotX',
    py: 'node:pivotY',
    sx: 'node:scaleX',
    sy: 'node:scaleY',
    t: 'node:localOpacity',
};

const PROPERTY_SHORTCUTS = Object.fromEntries(
    Object.entries(PROPERTY_ALIASES).map(([shortcut, propertyId]) => [propertyId, shortcut])
) as Record<string, string>;

type ShortcutPreset = {
    id: string;
    label: string;
    description: string;
    propertyIds: string[];
};

const SHORTCUT_PRESETS: ShortcutPreset[] = [
    {
        id: 'all-transforms',
        label: 'All Transforms',
        description: 'Translation X/Y · Rotation · Scale · Pivot X/Y',
        propertyIds: [
            'node:translationX',
            'node:translationY',
            'node:rotation',
            'node:scaleX',
            'node:scaleY',
            'node:pivotX',
            'node:pivotY',
        ],
    },
    {
        id: 'translation',
        label: 'Translation',
        description: 'X Translation · Y Translation',
        propertyIds: ['node:translationX', 'node:translationY'],
    },
    {
        id: 'pivot',
        label: 'Pivot',
        description: 'Pivot X · Pivot Y',
        propertyIds: ['node:pivotX', 'node:pivotY'],
    },
    {
        id: 'scales',
        label: 'Scales',
        description: 'Scale X · Scale Y',
        propertyIds: ['node:scaleX', 'node:scaleY'],
    },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutomatableProperty {
    id: string;
    key: string;
    label: string;
    groupLabel: string;
    type: string;
    valueType: AutomationValueType;
    target: PropertyTarget;
    default?: unknown;
}

type ListItem = { kind: 'preset'; preset: ShortcutPreset } | { kind: 'property'; prop: AutomatableProperty };

interface InsertKeyframePopupProps {
    position: { x: number; y: number };
    nodeId: string;
    elementId?: string;
    schema?: EnhancedConfigSchema;
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const InsertKeyframePopup: React.FC<InsertKeyframePopupProps> = ({ position, nodeId, elementId, schema, onClose }) => {
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const tick = useCurrentTick();
    const automationChannels = useSceneStore((state) => state.automation.channels);

    const allProperties = useMemo<AutomatableProperty[]>(() => {
        const result: AutomatableProperty[] = hostPropertyDescriptors(nodeId)
            .filter(
                (descriptor) =>
                    descriptor.capabilities.automatable &&
                    descriptor.target.propertyPath !== 'localVisible' &&
                    descriptor.target.propertyPath !== 'localLocked'
            )
            .map((descriptor) => ({
                id: `node:${descriptor.definition.key}`,
                key: descriptor.definition.key,
                label:
                    descriptor.definition.key === 'translationX'
                        ? 'X Translation'
                        : descriptor.definition.key === 'translationY'
                          ? 'Y Translation'
                          : descriptor.definition.label,
                groupLabel: `Node · ${descriptor.group.label}`,
                type: descriptor.definition.type,
                valueType: resolveAutomationValueType(descriptor.definition.type)!,
                target: descriptor.target,
                default: descriptor.definition.default,
            }));

        if (elementId && schema) {
            for (const group of schema.tabs.flatMap((t) => t.groups)) {
                for (const prop of group.properties) {
                    const valueType = resolveAutomationValueType(prop.type);
                    if (!valueType) continue;
                    result.push({
                        id: `element:${prop.key}`,
                        key: prop.key,
                        label: prop.label,
                        groupLabel: `Element · ${group.label}`,
                        type: prop.type,
                        valueType,
                        target: elementPropertyTarget(elementId, prop.key),
                        default: prop.default,
                    });
                }
            }
        }
        return result;
    }, [elementId, nodeId, schema]);

    const filteredItems = useMemo<ListItem[]>(() => {
        const q = search.toLowerCase().trim();

        const matchingPresets = SHORTCUT_PRESETS.filter((preset) => {
            const hasEveryProperty = preset.propertyIds.every((id) => allProperties.some((prop) => prop.id === id));
            return hasEveryProperty && (!q || preset.label.toLowerCase().includes(q) || preset.id.includes(q));
        });

        if (!q) {
            return [
                ...matchingPresets.map((preset): ListItem => ({ kind: 'preset', preset })),
                ...allProperties.map((prop): ListItem => ({ kind: 'property', prop })),
            ];
        }

        const allMatchingProps = allProperties.filter(
            (p) =>
                p.label.toLowerCase().includes(q) ||
                p.key.toLowerCase().includes(q) ||
                p.groupLabel.toLowerCase().includes(q)
        );

        // Tier 1: exact alias match (e.g. "x" → Offset X)
        const aliasTarget = PROPERTY_ALIASES[q];
        const aliasedProp = aliasTarget ? allProperties.find((p) => p.id === aliasTarget) : undefined;

        // Tier 2: exact label match (case-insensitive), excluding the alias target
        const exactLabelProps = allMatchingProps.filter((p) => p.label.toLowerCase() === q && p.id !== aliasedProp?.id);

        // Tier 4: loose matches — everything not already in tier 1 or 2
        const priorityIds = new Set<string>(exactLabelProps.map((p) => p.id));
        if (aliasedProp) priorityIds.add(aliasedProp.id);
        const looseProps = allMatchingProps.filter((p) => !priorityIds.has(p.id));

        // Final order: alias → exact label → presets → loose
        const result: ListItem[] = [];
        if (aliasedProp) result.push({ kind: 'property', prop: aliasedProp });
        for (const p of exactLabelProps) result.push({ kind: 'property', prop: p });
        for (const preset of matchingPresets) result.push({ kind: 'preset', preset });
        for (const p of looseProps) result.push({ kind: 'property', prop: p });
        return result;
    }, [allProperties, search]);

    // Reset active index when filter changes
    useEffect(() => {
        setActiveIndex(0);
    }, [search]);

    // Scroll active item into view
    useEffect(() => {
        if (!listRef.current) return;
        const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
        item?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    const getCurrentValue = useCallback(
        (prop: AutomatableProperty): unknown => {
            return effectiveValueForTarget(useSceneStore.getState(), prop.target, tick) ?? prop.default;
        },
        [tick]
    );

    const insertKeyframeForProp = useCallback(
        (prop: AutomatableProperty, mergeKey?: string) => {
            const target = prop.target;
            const channelId = channelForTarget({ channels: automationChannels }, target)?.id;
            const isAutomated = !!channelId;
            const currentValue = getCurrentValue(prop);
            const cmdOptions = { source: 'insert-keyframe-popup', mergeKey };

            if (!isAutomated) {
                dispatchSceneCommand(
                    {
                        type: 'enablePropertyAutomation',
                        target,
                        valueType: prop.valueType,
                        initialKeyframes: [createKeyframe(tick > 0 ? tick : 0, currentValue)],
                    },
                    cmdOptions
                );
            } else {
                dispatchSceneCommand(
                    {
                        type: 'addKeyframe',
                        channelId,
                        keyframe: createKeyframe(tick, currentValue),
                    },
                    cmdOptions
                );
            }
        },
        [tick, automationChannels, getCurrentValue]
    );

    const handleSelect = useCallback(
        (prop: AutomatableProperty) => {
            insertKeyframeForProp(prop);
            onClose();
        },
        [insertKeyframeForProp, onClose]
    );

    const handleSelectPreset = useCallback(
        (preset: ShortcutPreset) => {
            const mergeKey = `preset-keyframes:${preset.id}:${Date.now()}`;
            const validProps = preset.propertyIds
                .map((id) => allProperties.find((p) => p.id === id))
                .filter(Boolean) as AutomatableProperty[];
            for (const prop of validProps) {
                insertKeyframeForProp(prop, mergeKey);
            }
            onClose();
        },
        [allProperties, insertKeyframeForProp, onClose]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = filteredItems[activeIndex];
                if (!item) return;
                if (item.kind === 'preset') handleSelectPreset(item.preset);
                else handleSelect(item.prop);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        },
        [filteredItems, activeIndex, handleSelect, handleSelectPreset, onClose]
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
                    {filteredItems.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-neutral-500 select-none">No matching properties</div>
                    ) : (
                        filteredItems.map((item, i) => {
                            const isActive = i === activeIndex;
                            const baseClass = `w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${isActive ? 'bg-neutral-700/70' : 'hover:bg-neutral-700/40'}`;

                            if (item.kind === 'preset') {
                                return (
                                    <button
                                        key={item.preset.id}
                                        type="button"
                                        className={baseClass}
                                        onMouseEnter={() => setActiveIndex(i)}
                                        onClick={() => handleSelectPreset(item.preset)}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0 mt-px bg-sky-500" />
                                        <span className="flex-1 min-w-0">
                                            <span className="text-[13px] text-sky-300 block truncate">
                                                {item.preset.label}
                                            </span>
                                            <span className="text-[11px] text-neutral-500 block truncate">
                                                {item.preset.description}
                                            </span>
                                        </span>
                                    </button>
                                );
                            }

                            const { prop } = item;
                            const isAutomated = !!channelForTarget({ channels: automationChannels }, prop.target);
                            return (
                                <button
                                    key={prop.id}
                                    type="button"
                                    className={baseClass}
                                    onMouseEnter={() => setActiveIndex(i)}
                                    onClick={() => handleSelect(prop)}
                                >
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-px ${isAutomated ? 'bg-yellow-400' : 'bg-neutral-600'}`}
                                        title={isAutomated ? 'Already automated' : 'Not yet automated'}
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="text-[13px] text-neutral-200 block truncate">
                                            {prop.label}
                                        </span>
                                        <span className="text-[11px] text-neutral-500 block truncate">
                                            {prop.groupLabel}
                                        </span>
                                    </span>
                                    {PROPERTY_SHORTCUTS[prop.id] ? (
                                        <kbd className="flex-shrink-0 rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                                            {PROPERTY_SHORTCUTS[prop.id]}
                                        </kbd>
                                    ) : null}
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
