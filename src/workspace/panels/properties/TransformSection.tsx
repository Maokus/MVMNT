import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSceneEditorStore } from '@state/sceneEditorStore';

const TransformSectionScopeContext = createContext<{
    register: (id: string, setCollapsed: (collapsed: boolean) => void) => () => void;
    setAll: (collapsed: boolean) => void;
} | null>(null);

export function TransformSectionScope({ children }: { children: React.ReactNode }) {
    const sections = useRef(new Map<string, (collapsed: boolean) => void>());
    const actions = useMemo(
        () => ({
            register: (id: string, setCollapsed: (collapsed: boolean) => void) => {
                sections.current.set(id, setCollapsed);
                return () => {
                    sections.current.delete(id);
                };
            },
            setAll: (collapsed: boolean) => sections.current.forEach((setCollapsed) => setCollapsed(collapsed)),
        }),
        []
    );
    return <TransformSectionScopeContext.Provider value={actions}>{children}</TransformSectionScopeContext.Provider>;
}

export function TransformSection({
    title,
    children,
    ownerKey,
}: {
    title: string;
    children: React.ReactNode;
    ownerKey?: string;
}) {
    const [localCollapsed, setLocalCollapsed] = useState(false);
    const storedCollapsed = useSceneEditorStore((state) =>
        ownerKey ? state.expandedPropertyGroups[ownerKey]?.[title] : undefined
    );
    const setPropertyGroupCollapseState = useSceneEditorStore((state) => state.setPropertyGroupCollapseState);
    const collapsed = storedCollapsed ?? localCollapsed;
    const scope = useContext(TransformSectionScopeContext);
    const sectionId = useId();
    const setCollapsed = useCallback(
        (next: boolean) => {
            if (ownerKey) setPropertyGroupCollapseState(ownerKey, title, next);
            else setLocalCollapsed(next);
        },
        [ownerKey, setPropertyGroupCollapseState, title]
    );
    useEffect(() => scope?.register(sectionId, setCollapsed), [scope, sectionId, setCollapsed]);
    const toggle = (recursive: boolean) => {
        const next = !collapsed;
        if (recursive && scope) scope.setAll(next);
        else setCollapsed(next);
    };
    return (
        <section className="ae-property-group">
            <button
                type="button"
                className="ae-group-header"
                onClick={(event) => toggle(event.metaKey || event.ctrlKey)}
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title} group`}
            >
                <span className={`ae-collapse-trigger ${collapsed ? 'collapsed' : 'expanded'}`} aria-hidden="true">
                    <span className={`ae-collapse-icon ${collapsed ? 'collapsed' : 'expanded'}`}>▼</span>
                </span>
                <div className="ae-group-meta">
                    <div className="ae-group-title-row">
                        <span className="ae-group-label">{title}</span>
                    </div>
                </div>
            </button>
            {!collapsed ? <div className="ae-property-list">{children}</div> : null}
        </section>
    );
}
