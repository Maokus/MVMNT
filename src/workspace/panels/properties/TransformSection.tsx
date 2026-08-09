import React, { useState } from 'react';
import { useSceneEditorStore } from '@state/sceneEditorStore';

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
    const toggle = () => {
        if (ownerKey) setPropertyGroupCollapseState(ownerKey, title, !collapsed);
        else setLocalCollapsed(!collapsed);
    };
    return (
        <section className="ae-property-group">
            <button
                type="button"
                className="ae-group-header"
                onClick={toggle}
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
