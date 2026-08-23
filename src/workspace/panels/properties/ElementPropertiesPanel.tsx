import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import PropertyGroupPanel from './PropertyGroupPanel';
import PropertyTabStrip, { OverflowAction } from './PropertyTabStrip';
import type { ElementPropertyDefinition as PropertyDefinition } from '@mvmnt-app/plugin-sdk';
import type { RegisteredElementSchema as EnhancedConfigSchema } from '@core/scene/runtime/schema';
import { useMacros } from '@context/MacroContext';
import type { ElementBindings } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { FormInputChange } from '@workspace/forms/inputs/FormInput';
import { useCurrentTick } from '@automation/hooks';
import { findKeyframeAtTick, elementPropertyTarget } from '@automation/types';
import { useSceneStore } from '@state/sceneStore';
import { useSceneEditorStore } from '@state/sceneEditorStore';
import { useTimelineStore } from '@state/timelineStore';
import { shallow } from 'zustand/shallow';
import { dispatchSceneCommand } from '@state/scene';
import { automationEvaluator } from '@automation/automation-evaluator';
import { resolveAutomationValueType } from './KeyframeControl';
import { NodeTransformPanel } from './NodeTransformPanel';
import { dispatchPropertyEdits, propertyEditMergeKey } from '@state/scene';
import { activateCommandSurface } from '@context/commands/commandContext';

const NODE_TRANSFORM_TAB_ID = '__node-transform';

interface ElementPropertiesPanelProps {
    elementId: string;
    elementType: string;
    schema: EnhancedConfigSchema | null;
    bindings: ElementBindings;
    onConfigChange: (
        elementId: string,
        changes: { [key: string]: any },
        options?: Omit<SceneCommandOptions, 'source'>
    ) => void;
    refreshToken?: number;
    includeNodeTransforms?: boolean;
}

interface PropertyValues {
    [key: string]: any;
}

interface MacroAssignments {
    [key: string]: string;
}

const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
    elementId,
    elementType,
    schema,
    bindings,
    onConfigChange,
    refreshToken = 0,
    includeNodeTransforms = false,
}) => {
    const [enhancedSchema, setEnhancedSchema] = useState<EnhancedConfigSchema | null>(
        () => (schema as EnhancedConfigSchema) ?? null
    );
    const [propertyValues, setPropertyValues] = useState<PropertyValues>({});
    const [macroAssignments, setMacroAssignments] = useState<MacroAssignments>({});
    const [macroListenerKey, setMacroListenerKey] = useState(0);
    const [searchActive, setSearchActive] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Reset property state synchronously when the element changes, so the panel never briefly
    // shows the previous element's values before the useEffect has a chance to load new ones.
    const [lastRenderedElementId, setLastRenderedElementId] = useState(elementId);
    if (lastRenderedElementId !== elementId) {
        // Match the active tab by label: if new element has a tab with the same label as the
        // currently active tab, switch to it. Otherwise fall back to the stored tab for the new element.
        // Read the old element's active tab ID directly from the store (activeTabId is not yet
        // initialized at this point — it's a useMemo declared further down).
        const oldTabId = useSceneEditorStore.getState().activePropertyTab[lastRenderedElementId];
        const prevTabLabel =
            oldTabId === NODE_TRANSFORM_TAB_ID ? 'Host' : enhancedSchema?.tabs.find((t) => t.id === oldTabId)?.label;
        if (prevTabLabel && schema) {
            const newTabs = (schema as EnhancedConfigSchema).tabs ?? [];
            const matchingTab =
                includeNodeTransforms && prevTabLabel === 'Host'
                    ? { id: NODE_TRANSFORM_TAB_ID }
                    : newTabs.find((t) => t.label === prevTabLabel);
            if (matchingTab) {
                useSceneEditorStore.getState().setActivePropertyTab(elementId, matchingTab.id);
            }
        }
        setLastRenderedElementId(elementId);
        setPropertyValues({});
        setMacroAssignments({});
        setSearchActive(false);
        setSearchTerm('');
    }
    const panelRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const { assignListener, macros: macroList } = useMacros();
    const macroLookup = useMemo(
        () => new Map((macroList as any[]).map((macro: any) => [macro.name, macro])),
        [macroList]
    );
    const currentTick = useCurrentTick();
    const autoKeying = useTimelineStore((s) => s.transport.autoKeying);
    const groupCollapseState = useSceneEditorStore(
        useCallback((s) => s.expandedPropertyGroups[elementId] ?? {}, [elementId])
    );
    const setPropertyGroupCollapseState = useSceneEditorStore((s) => s.setPropertyGroupCollapseState);
    const storedActiveTabId = useSceneEditorStore(useCallback((s) => s.activePropertyTab[elementId], [elementId]));
    const setActivePropertyTab = useSceneEditorStore((s) => s.setActivePropertyTab);
    const propertyClipboard = useSceneEditorStore(useCallback((s) => s.propertyClipboard, []));
    const setPropertyClipboard = useSceneEditorStore((s) => s.setPropertyClipboard);

    // Fast property-type lookup used by auto-keying logic
    const propertyTypeMap = useMemo(() => {
        const map = new Map<string, string>();
        enhancedSchema?.tabs
            .flatMap((t) => t.groups)
            .forEach((group) => {
                group.properties.forEach((prop) => map.set(prop.key, prop.type));
            });
        return map;
    }, [enhancedSchema]);

    const inspectorTabs = useMemo(
        () => [
            ...(includeNodeTransforms ? [{ id: NODE_TRANSFORM_TAB_ID, label: 'Host', groups: [] }] : []),
            ...(enhancedSchema?.tabs ?? []),
        ],
        [enhancedSchema, includeNodeTransforms]
    );

    const activeTabId = useMemo(() => {
        if (!enhancedSchema) return '';
        if (storedActiveTabId && inspectorTabs.some((t) => t.id === storedActiveTabId)) {
            return storedActiveTabId;
        }
        return inspectorTabs[0]?.id ?? '';
    }, [storedActiveTabId, enhancedSchema, inspectorTabs]);

    // Keyframe insertion can originate outside this panel (the `I` popup and timeline).
    // Subscribe to the authoritative binding map rather than waiting for a selection-context
    // snapshot to propagate, so the diamond state changes in the same store update.
    const liveBindings = useSceneStore(
        useCallback((state) => state.bindings.byElement[elementId] ?? {}, [elementId]),
        shallow
    );
    const bindingsMemo = liveBindings ?? bindings ?? {};
    const automationChannelIds = useMemo(
        () =>
            Object.values(bindingsMemo)
                .filter((binding) => binding.type === 'keyframes')
                .map((binding) => binding.channelId)
                .sort(),
        [bindingsMemo]
    );
    const automationChannels = useSceneStore(
        useCallback(
            (state) =>
                Object.fromEntries(
                    automationChannelIds.flatMap((channelId) => {
                        const channel = state.automation.channels[channelId];
                        return channel ? [[channelId, channel]] : [];
                    })
                ),
            [automationChannelIds]
        ),
        shallow
    );

    const handleMacroStoreUpdate = useCallback(() => {
        setMacroListenerKey((prev) => prev + 1);
    }, []);

    useEffect(() => {
        const unsubscribe = assignListener(handleMacroStoreUpdate);
        return () => unsubscribe();
    }, [assignListener, handleMacroStoreUpdate]);

    useEffect(() => {
        if (!schema) {
            setEnhancedSchema(null);
            setPropertyValues({});
            setMacroAssignments({});
            return;
        }

        const groupedSchema = schema as EnhancedConfigSchema;
        setEnhancedSchema(groupedSchema);

        const nextValues: PropertyValues = {};
        const nextAssignments: MacroAssignments = {};

        groupedSchema.tabs
            .flatMap((t) => t.groups)
            .forEach((group) => {
                group.properties.forEach((property) => {
                    const binding = bindingsMemo[property.key];
                    if (binding?.type === 'macro') {
                        nextAssignments[property.key] = binding.macroId;
                        const macro = macroLookup.get(binding.macroId);
                        if (macro) {
                            const macroValue = macro.value;
                            nextValues[property.key] = macroValue;
                        } else {
                            nextValues[property.key] = property.default ?? null;
                        }
                    } else if (binding?.type === 'keyframes') {
                        const chId = binding.channelId;
                        if (!chId) {
                            nextValues[property.key] = property.default ?? null;
                            return;
                        }
                        // Exact keys bypass the evaluator cache so a just-edited key displays immediately.
                        const channel = automationChannels[chId];
                        if (channel) {
                            const kfAtTick = findKeyframeAtTick(channel.keyframes, currentTick);
                            if (kfAtTick !== null) {
                                nextValues[property.key] = kfAtTick.value;
                            } else {
                                const evaluated = automationEvaluator.evaluate(chId, currentTick);
                                nextValues[property.key] = evaluated ?? property.default;
                            }
                        } else {
                            nextValues[property.key] = property.default ?? null;
                        }
                    } else if (binding?.type === 'constant') {
                        nextValues[property.key] = binding.value ?? property.default;
                    } else {
                        nextValues[property.key] = property.default ?? null;
                    }
                });
            });

        setPropertyValues(nextValues);
        setMacroAssignments(nextAssignments);

        // Initialize any groups that don't yet have a stored collapse state
        const currentGroupState = useSceneEditorStore.getState().expandedPropertyGroups[elementId] ?? {};
        groupedSchema.tabs
            .flatMap((t) => t.groups)
            .forEach((group) => {
                if (!Object.prototype.hasOwnProperty.call(currentGroupState, group.id) && group.collapsed) {
                    setPropertyGroupCollapseState(elementId, group.id, true);
                }
            });
    }, [
        schema,
        bindingsMemo,
        macroLookup,
        macroListenerKey,
        elementId,
        elementType,
        currentTick,
        automationChannels,
        setPropertyGroupCollapseState,
    ]);

    const propertyPassesVisibility = useCallback(
        (property: PropertyDefinition) => {
            if (!property.visibleWhen || property.visibleWhen.length === 0) {
                return true;
            }

            return property.visibleWhen.every((rule) => {
                if ('equals' in rule) {
                    return propertyValues[rule.key] === rule.equals;
                }
                if ('notEquals' in rule) {
                    return propertyValues[rule.key] !== rule.notEquals;
                }
                if ('truthy' in rule) {
                    return Boolean(propertyValues[rule.key]);
                }
                if ('falsy' in rule) {
                    return !propertyValues[rule.key];
                }
                return true;
            });
        },
        [propertyValues]
    );

    // visibleWhen conditions are evaluated across all tabs regardless of the active tab —
    // a condition referencing a property in another tab still works correctly.
    const filteredGroups = useMemo(() => {
        if (!enhancedSchema) return [];

        const sourceGroups =
            searchActive && searchTerm.trim()
                ? enhancedSchema.tabs.flatMap((t) => t.groups)
                : (enhancedSchema.tabs.find((t) => t.id === activeTabId)?.groups ?? []);

        const term = searchTerm.trim().toLowerCase();

        return sourceGroups
            .map((group) => {
                const visibleProperties = group.properties.filter((p) => {
                    if (!propertyPassesVisibility(p)) return false;
                    if (searchActive && term) {
                        return p.label.toLowerCase().includes(term) || p.key.toLowerCase().includes(term);
                    }
                    return true;
                });
                return { group, properties: visibleProperties };
            })
            .filter(({ properties }) => properties.length > 0);
    }, [enhancedSchema, activeTabId, propertyPassesVisibility, searchActive, searchTerm]);

    const handleCollapseToggle = useCallback(
        (groupId: string) => {
            const current = useSceneEditorStore.getState().expandedPropertyGroups[elementId] ?? {};
            setPropertyGroupCollapseState(elementId, groupId, !current[groupId]);
        },
        [elementId, setPropertyGroupCollapseState]
    );

    const handleValuesChange = useCallback(
        (patch: Record<string, any>, meta?: FormInputChange['meta']) => {
            if (Object.keys(patch).length === 0) return;
            setPropertyValues((prev) => ({
                ...prev,
                ...patch,
            }));

            const targets = Object.keys(patch).map((key) => elementPropertyTarget(elementId, key));
            const session = meta?.mergeSession;
            dispatchPropertyEdits(
                Object.entries(patch).map(([key, value]) => ({
                    target: elementPropertyTarget(elementId, key),
                    value,
                    valueType: resolveAutomationValueType(propertyTypeMap.get(key) ?? ''),
                })),
                {
                    tick: currentTick,
                    autoKey: autoKeying,
                    source: 'property-panel',
                    mergeKey: session ? propertyEditMergeKey(targets, session.id) : undefined,
                    transient: session ? !session.finalize : undefined,
                }
            );
        },
        [elementId, currentTick, autoKeying, propertyTypeMap]
    );

    const handleValueChange = useCallback(
        (key: string, value: any, meta?: FormInputChange['meta']) => {
            handleValuesChange({ [key]: value, ...(meta?.linkedUpdates ?? {}) }, meta);
        },
        [handleValuesChange]
    );

    const handleMacroAssignment = useCallback(
        (propertyKey: string, macroName: string) => {
            if (macroName) {
                setMacroAssignments((prev) => ({ ...prev, [propertyKey]: macroName }));
                if (onConfigChange) {
                    onConfigChange(elementId, { [propertyKey]: { type: 'macro', macroId: macroName } });
                }
            } else {
                setMacroAssignments((prev) => {
                    const next = { ...prev };
                    delete next[propertyKey];
                    return next;
                });
                const currentValue = propertyValues[propertyKey];
                if (onConfigChange) {
                    onConfigChange(elementId, { [propertyKey]: currentValue });
                }
            }
            setMacroListenerKey((prev) => prev + 1);
        },
        [elementId, onConfigChange, propertyValues]
    );

    const handleResetAll = useCallback(() => {
        if (!enhancedSchema) return;
        const defaults: Record<string, any> = {};
        enhancedSchema.tabs
            .flatMap((t) => t.groups)
            .forEach((group) => {
                group.properties.forEach((prop) => {
                    if (prop.default !== undefined) {
                        defaults[prop.key] = prop.default;
                    }
                });
            });
        if (Object.keys(defaults).length > 0) {
            onConfigChange(elementId, defaults);
        }
    }, [enhancedSchema, elementId, onConfigChange]);

    const handleCopy = useCallback(() => {
        if (!enhancedSchema) return;
        const values: Record<string, any> = {};
        enhancedSchema.tabs
            .flatMap((t) => t.groups)
            .forEach((group) => {
                group.properties.forEach((prop) => {
                    if (!macroAssignments[prop.key]) {
                        values[prop.key] = propertyValues[prop.key];
                    }
                });
            });
        setPropertyClipboard({ elementType, values });
    }, [enhancedSchema, elementType, propertyValues, macroAssignments, setPropertyClipboard]);

    const handlePaste = useCallback(() => {
        if (!propertyClipboard || !enhancedSchema) return;
        const schemaKeys = new Set(
            enhancedSchema.tabs.flatMap((t) => t.groups).flatMap((g) => g.properties.map((p) => p.key))
        );
        const patch: Record<string, any> = {};
        Object.entries(propertyClipboard.values).forEach(([key, value]) => {
            if (schemaKeys.has(key)) {
                patch[key] = value;
            }
        });
        if (Object.keys(patch).length > 0) {
            onConfigChange(elementId, patch);
        }
    }, [propertyClipboard, enhancedSchema, elementId, onConfigChange]);

    const openSearch = useCallback(() => {
        setSearchActive(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
    }, []);

    const closeSearch = useCallback(() => {
        setSearchActive(false);
        setSearchTerm('');
    }, []);

    const handlePanelKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                openSearch();
            }
        },
        [openSearch]
    );

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Escape') {
                closeSearch();
            }
        },
        [closeSearch]
    );

    const overflowActions = useMemo<OverflowAction[]>(() => {
        const actions: OverflowAction[] = [
            { label: 'Reset All', onActivate: handleResetAll },
            { label: 'Copy', onActivate: handleCopy },
            { label: 'Paste', onActivate: handlePaste, disabled: !propertyClipboard },
        ];

        if (enhancedSchema) {
            const presetActions: OverflowAction[] = [];
            // Schema-level presets (preferred)
            enhancedSchema.presets?.forEach((preset) => {
                presetActions.push({
                    label: preset.label,
                    dividerBefore: presetActions.length === 0,
                    onActivate: () => onConfigChange(elementId, preset.values),
                });
            });
            actions.push(...presetActions);
        }

        return actions;
    }, [handleResetAll, handleCopy, handlePaste, propertyClipboard, enhancedSchema, elementId, onConfigChange]);

    if (!enhancedSchema) {
        return (
            <div className="element-properties-panel ae-style empty">
                <p className="text-sm opacity-70">No configurable properties available for this element.</p>
            </div>
        );
    }

    return (
        <div
            className="element-properties-panel ae-style"
            ref={panelRef}
            data-command-surface="properties"
            onPointerDownCapture={() => activateCommandSurface('properties')}
            onFocusCapture={() => activateCommandSurface('properties')}
            onKeyDown={handlePanelKeyDown}
        >
            {searchActive && (
                <div className="ae-search-bar">
                    <input
                        ref={searchInputRef}
                        className="ae-search-input"
                        type="text"
                        placeholder="Search properties…"
                        value={searchTerm}
                        onChange={(e) => {
                            const nextTerm = e.target.value;
                            if (nextTerm === '') {
                                closeSearch();
                                return;
                            }
                            setSearchTerm(nextTerm);
                        }}
                        onKeyDown={handleSearchKeyDown}
                        autoFocus
                    />
                    <button type="button" className="ae-search-close" onClick={closeSearch} title="Close search">
                        <FaTimes aria-hidden="true" />
                    </button>
                </div>
            )}
            <PropertyTabStrip
                tabs={inspectorTabs}
                activeTabId={activeTabId}
                onTabChange={(tabId) => setActivePropertyTab(elementId, tabId)}
                overflowActions={overflowActions}
                onSearch={openSearch}
            />
            {activeTabId === NODE_TRANSFORM_TAB_ID ? <NodeTransformPanel /> : null}
            {activeTabId !== NODE_TRANSFORM_TAB_ID &&
                filteredGroups.map(({ group, properties }) => (
                    <PropertyGroupPanel
                        key={group.id}
                        group={{ ...group, collapsed: groupCollapseState[group.id] ?? group.collapsed }}
                        properties={searchActive ? properties : group.properties}
                        values={propertyValues}
                        macroAssignments={macroAssignments}
                        elementId={elementId}
                        delinkedKeys={new Set()}
                        onValueChange={handleValueChange}
                        onValuesChange={handleValuesChange}
                        onMacroAssignment={handleMacroAssignment}
                        onCollapseToggle={handleCollapseToggle}
                        useLayout={!searchActive}
                    />
                ))}
            {searchActive && searchTerm.trim() && filteredGroups.length === 0 && (
                <div className="ae-empty-search">No matching properties.</div>
            )}
        </div>
    );
};

export default ElementPropertiesPanel;
