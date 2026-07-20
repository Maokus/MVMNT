import React, { useState } from 'react';
import type { PropertyDefinition, PropertyLayoutNode, PropertyVisibilityCondition } from '@core/types';
import { propertyControlRegistry } from './PropertyControlRegistry';

interface Props {
    nodes: PropertyLayoutNode[];
    properties: PropertyDefinition[];
    values: Record<string, unknown>;
    renderProperty: (property: PropertyDefinition, nested?: boolean) => React.ReactNode;
    isDisabled: (propertyKey: string) => boolean;
    onPatch: (patch: Record<string, unknown>, gesture?: { id: string; finalize: boolean }) => void;
}

const passes = (rules: PropertyVisibilityCondition[] | undefined, values: Record<string, unknown>) => !rules?.length || rules.every((rule) =>
    'equals' in rule ? values[rule.key] === rule.equals :
    'notEquals' in rule ? values[rule.key] !== rule.notEquals :
    'truthy' in rule ? Boolean(values[rule.key]) : !values[rule.key],
);

const Section: React.FC<{ node: Extract<PropertyLayoutNode, { kind: 'section' }>; children: React.ReactNode }> = ({ node, children }) => {
    const [collapsed, setCollapsed] = useState(Boolean(node.collapsed));
    return <section className="ae-property-layout-section">
        {node.label && <button type="button" className="ae-property-layout-section-title" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>{node.label}</button>}
        {!collapsed && children}
    </section>;
};

export const PropertyLayoutRenderer: React.FC<Props> = ({ nodes, properties, values, renderProperty, isDisabled, onPatch }) => {
    const propertyMap = new Map(properties.map((property) => [property.key, property]));
    const laidOut = new Set<string>();
    const renderNodes = (children: PropertyLayoutNode[], nested = false): React.ReactNode[] => children.reduce<React.ReactNode[]>((result, node) => {
        if (!passes('visibleWhen' in node ? node.visibleWhen : undefined, values)) return result;
        if (node.kind === 'property') {
            const property = propertyMap.get(node.propertyKey);
            if (!property) return result;
            laidOut.add(property.key);
            result.push(renderProperty(property, nested));
            return result;
        }
        if (node.kind === 'section') {
            result.push(<Section key={node.id} node={node}>{renderNodes(node.children, true)}</Section>);
            return result;
        }
        if (node.kind === 'actions') {
            result.push(<div className="ae-property-layout-actions" key={node.actions.map((action) => action.id).join(':')}>
            {node.actions.map((action) => <button key={action.id} type="button" onClick={() => onPatch(action.patch)}>{action.label}</button>)}
            </div>);
            return result;
        }
        const registration = propertyControlRegistry.get(node.control);
        const error = !registration ? `unknown control ${node.control}` : registration.validate(node.bindings, propertyMap);
        if (error) {
            console.warn('[PropertyLayoutRenderer] Falling back to property rows', { control: node.control, error });
            const fallbackProperties = Object.values(node.bindings).map((key) => propertyMap.get(key)).filter(Boolean) as PropertyDefinition[];
            fallbackProperties.forEach((property) => laidOut.add(property.key));
            result.push(...fallbackProperties.map((property) => renderProperty(property, nested)));
            return result;
        }
        Object.values(node.bindings).forEach((key) => laidOut.add(key));
        const Control = registration!.component;
        result.push(<Control key={`${node.control}:${Object.values(node.bindings).join(':')}`} bindings={node.bindings} options={node.options} properties={propertyMap} values={values} disabled={isDisabled} setMany={onPatch} />);
        return result;
    }, []);
    const rendered = renderNodes(nodes);
    for (const property of properties) if (!laidOut.has(property.key)) rendered.push(renderProperty(property));
    return <>{rendered}</>;
};
