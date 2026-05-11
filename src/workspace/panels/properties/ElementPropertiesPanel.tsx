import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import PropertyGroupPanel from './PropertyGroupPanel';
import PropertyTabStrip, { OverflowAction } from './PropertyTabStrip';
import { EnhancedConfigSchema, PropertyDefinition } from '@core/types';
import { useMacros } from '@context/MacroContext';
import type { ElementBindings } from '@state/sceneStore';
import type { SceneCommandOptions } from '@state/scene';
import type { FormInputChange } from '@workspace/forms/inputs/FormInput';
import { useCurrentTick } from '@automation/hooks';
import { makeChannelId, findKeyframeAtTick, createKeyframe } from '@automation/types';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import { dispatchSceneCommand } from '@state/scene/commandGateway';
import { automationEvaluator } from '@automation/automation-evaluator';
import { resolveAutomationValueType } from './KeyframeControl';

interface ElementPropertiesPanelProps {
    elementId: string;
    elementType: string;
    schema: EnhancedConfigSchema | null;
    bindings: ElementBindings;
    onConfigChange: (
        elementId: string,
        changes: { [key: string]: any },
        options?: Omit<SceneCommandOptions, 'source'>,
    ) => void;
    refreshToken?: number;
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
}) => {
    const [enhancedSchema, setEnhancedSchema] = useState<EnhancedConfigSchema | null>(
        () => (schema as EnhancedConfigSchema) ?? null,
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
        const prevTabLabel = enhancedSchema?.tabs.find((t) => t.id === activeTabId)?.label;
        if (prevTabLabel && schema) {
            const newTabs = (schema as EnhancedConfigSchema).tabs ?? [];
            const matchingTab = newTabs.find((t) => t.label === prevTabLabel);
            if (matchingTab) {
                useSceneStore.getState().setActivePropertyTab(elementId, matchingTab.id);
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
    const macroLookup = useMemo(() => new Map((macroList as any[]).map((macro: any) => [macro.name, macro])), [macroList]);
    const currentTick = useCurrentTick();
    const automationChannels = useSceneStore(useCallback((s) => s.automation.channels, []));
    const autoKeying = useTimelineStore((s) => s.transport.autoKeying);
    const propertyOverrides = useSceneStore(useCallback((s) => s.propertyOverrides, []));
    const groupCollapseState = useSceneStore(useCallback((s) => s.interaction.expandedPropertyGroups[elementId] ?? {}, [elementId]));
    const setPropertyGroupCollapseState = useSceneStore((s) => s.setPropertyGroupCollapseState);
    const storedActiveTabId = useSceneStore(useCallback((s) => s.interaction.activePropertyTab[elementId], [elementId]));
    const setActivePropertyTab = useSceneStore((s) => s.setActivePropertyTab);
    const propertyClipboard = useSceneStore(useCallback((s) => s.interaction.propertyClipboard, []));
    const setPropertyClipboard = useSceneStore((s) => s.setPropertyClipboard);

    const activeTabId = useMemo(() => {
        if (!enhancedSchema) return '';
        if (storedActiveTabId && enhancedSchema.tabs.some((t) => t.id === storedActiveTabId)) {
            return storedActiveTabId;
        }
        return enhancedSchema.tabs[0]?.id ?? '';
    }, [storedActiveTabId, enhancedSchema]);

    // Fast property-type lookup used by auto-keying logic
    const propertyTypeMap = useMemo(() => {
        const map = new Map<string, string>();
        enhancedSchema?.tabs.flatMap((t) => t.groups).forEach((group) => {
            group.properties.forEach((prop) => map.set(prop.key, prop.type));
        });
        return map;
    }, [enhancedSchema]);

    const bindingsMemo = useMemo(() => ({ ...(bindings ?? {}) }), [bindings, refreshToken]);

    const delinkedKeys = useMemo(() => {
        const keys = new Set<string>();
        if (!enhancedSchema) return keys;
        enhancedSchema.tabs.flatMap((t) => t.groups).forEach((group) => {
            group.properties.forEach((property) => {
                const binding = bindingsMemo[property.key];
                if (binding?.type === 'keyframes') {
                    const chId = makeChannelId(elementId, property.key);
                    if (propertyOverrides[chId] !== undefined) {
                        keys.add(property.key);
                    }
                }
            });
        });
        return keys;
    }, [enhancedSchema, bindingsMemo, propertyOverrides, elementId]);

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

        groupedSchema.tabs.flatMap((t) => t.groups).forEach((group) => {
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
                    // Evaluate automation at current tick for display.
                    // Check transient override first (set when auto key is off and user manually
                    // changes a keyframed property — clears automatically on scrub/play).
                    const chId = makeChannelId(elementId, property.key);
                    const override = propertyOverrides[chId];
                    if (override !== undefined) {
                        nextValues[property.key] = override;
                    } else {
                        // Read directly from automationChannels (hook-captured, always current) first.
                        // This avoids stale evaluator-curve-cache results when a keyframe was just
                        // added/modified at the current tick — the exact-match path bypasses the cache.
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
        const currentGroupState = useSceneStore.getState().interaction.expandedPropertyGroups[elementId] ?? {};
        groupedSchema.tabs.flatMap((t) => t.groups).forEach((group) => {
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
        refreshToken,
        currentTick,
        automationChannels,
        propertyOverrides,
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
        [propertyValues],
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

    const handleCollapseToggle = useCallback((groupId: string) => {
        const current = useSceneStore.getState().interaction.expandedPropertyGroups[elementId] ?? {};
        setPropertyGroupCollapseState(elementId, groupId, !current[groupId]);
    }, [elementId, setPropertyGroupCollapseState]);

    const handleValueChange = useCallback(
        (key: string, value: any, meta?: FormInputChange['meta']) => {
            const linked = meta?.linkedUpdates ?? undefined;
            setPropertyValues((prev) => ({
                ...prev,
                [key]: value,
                ...(linked ?? {}),
            }));

            if (autoKeying) {
                const chId = makeChannelId(elementId, key);
                if (!useSceneStore.getState().automation.channels[chId]) {
                    const valueType = resolveAutomationValueType(propertyTypeMap.get(key) ?? '');
                    if (valueType) {
                        const session = meta?.mergeSession;
                        const cmdOptions: SceneCommandOptions = { source: 'property-panel' };
                        if (session) {
                            cmdOptions.mergeKey = `kf-drag:${chId}:${session.id}`;
                            cmdOptions.transient = !session.finalize;
                        }
                        dispatchSceneCommand(
                            { type: 'enablePropertyAutomation', elementId, propertyKey: key, valueType, initialKeyframes: [createKeyframe(currentTick, value)] },
                            cmdOptions,
                        );
                        return;
                    }
                }
            }

            if (onConfigChange) {
                let options: Omit<SceneCommandOptions, 'source'> | undefined;
                const session = meta?.mergeSession;
                if (session && elementId) {
                    const mergeKey = `property-drag:${elementId}:${key}:${session.id}`;
                    options = {
                        mergeKey,
                        transient: !session.finalize,
                        canMergeWith: (other) =>
                            other.command.type === 'updateElementConfig' &&
                            other.command.elementId === elementId &&
                            Object.prototype.hasOwnProperty.call(other.command.patch ?? {}, key),
                    };
                }
                const patch: Record<string, any> = { [key]: value };
                if (linked) {
                    Object.entries(linked).forEach(([linkedKey, linkedValue]) => {
                        patch[linkedKey] = linkedValue;
                    });
                }
                onConfigChange(elementId, patch, options);
            }
        },
        [elementId, onConfigChange, currentTick, autoKeying, propertyTypeMap],
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
        [elementId, onConfigChange, propertyValues],
    );

    const handleResetAll = useCallback(() => {
        if (!enhancedSchema) return;
        const defaults: Record<string, any> = {};
        enhancedSchema.tabs.flatMap((t) => t.groups).forEach((group) => {
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
        enhancedSchema.tabs.flatMap((t) => t.groups).forEach((group) => {
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
            enhancedSchema.tabs.flatMap((t) => t.groups).flatMap((g) => g.properties.map((p) => p.key)),
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
        [openSearch],
    );

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Escape') {
                closeSearch();
            }
        },
        [closeSearch],
    );

    const overflowActions = useMemo<OverflowAction[]>(() => {
        const actions: OverflowAction[] = [
            { label: 'Reset All', onActivate: handleResetAll },
            { label: 'Copy', onActivate: handleCopy },
            { label: 'Paste', onActivate: handlePaste, disabled: !propertyClipboard },
        ];

        if (enhancedSchema) {
            const presetActions: OverflowAction[] = [];
            enhancedSchema.tabs.flatMap((t) => t.groups).forEach((group) => {
                group.presets?.forEach((preset) => {
                    presetActions.push({
                        label: preset.label,
                        dividerBefore: presetActions.length === 0,
                        onActivate: () => onConfigChange(elementId, preset.values),
                    });
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
        <div className="element-properties-panel ae-style" ref={panelRef} onKeyDown={handlePanelKeyDown}>
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
                tabs={enhancedSchema.tabs}
                activeTabId={activeTabId}
                onTabChange={(tabId) => setActivePropertyTab(elementId, tabId)}
                overflowActions={overflowActions}
                onSearch={openSearch}
            />
            {filteredGroups.map(({ group, properties }) => (
                <PropertyGroupPanel
                    key={group.id}
                    group={{ ...group, collapsed: groupCollapseState[group.id] ?? group.collapsed }}
                    properties={properties}
                    values={propertyValues}
                    macroAssignments={macroAssignments}
                    elementId={elementId}
                    delinkedKeys={delinkedKeys}
                    onValueChange={handleValueChange}
                    onMacroAssignment={handleMacroAssignment}
                    onCollapseToggle={handleCollapseToggle}
                />
            ))}
            {searchActive && searchTerm.trim() && filteredGroups.length === 0 && (
                <div className="ae-empty-search">No matching properties.</div>
            )}
        </div>
    );
};

export default ElementPropertiesPanel;
