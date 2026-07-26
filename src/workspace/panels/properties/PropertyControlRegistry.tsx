import React from 'react';
import type { PropertyDefinition } from '@core/types';

export interface PropertyControlProps {
    bindings: Record<string, string>;
    options?: Record<string, unknown>;
    properties: Map<string, PropertyDefinition>;
    values: Record<string, unknown>;
    disabled: (propertyKey: string) => boolean;
    setMany: (patch: Record<string, unknown>, gesture?: { id: string; finalize: boolean }) => void;
}

export interface PropertyControlRegistration {
    id: string;
    validate: (bindings: Record<string, string>, properties: Map<string, PropertyDefinition>) => string | null;
    component: React.ComponentType<PropertyControlProps>;
}

export class PropertyControlRegistry {
    private readonly registrations = new Map<string, PropertyControlRegistration>();

    register(registration: PropertyControlRegistration): void {
        if (this.registrations.has(registration.id)) {
            throw new Error(`Property control "${registration.id}" is already registered.`);
        }
        this.registrations.set(registration.id, registration);
    }

    get(id: string): PropertyControlRegistration | undefined {
        return this.registrations.get(id);
    }
}

const requireNumericPorts = (ports: string[]) => (bindings: Record<string, string>, properties: Map<string, PropertyDefinition>) => {
    for (const port of ports) {
        const key = bindings[port];
        const property = key ? properties.get(key) : undefined;
        if (!property) return `missing ${port} binding`;
        if (property.type !== 'number') return `${key} must be numeric`;
    }
    return null;
};

const NumericControl: React.FC<PropertyControlProps & { ports: string[]; label: string }> = ({ bindings, options, properties, values, disabled, setMany, ports, label }) => {
    const session = React.useRef<string | null>(null);
    const lastPatch = React.useRef<Record<string, unknown>>({});
    const begin = () => (session.current ??= `property-control-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
    const finish = () => {
        if (!session.current) return;
        setMany(lastPatch.current, { id: session.current, finalize: true });
        session.current = null;
        lastPatch.current = {};
    };
    return <fieldset className="ae-property-control" aria-label={label}>
        <legend>{label}</legend>
        {ports.map((port) => {
            const key = bindings[port];
            const property = properties.get(key)!;
            const value = typeof values[key] === 'number' ? values[key] : Number(property.default ?? 0);
            const min = typeof options?.[`${port}Min`] === 'number' ? options[`${port}Min`] as number : property.min ?? 0;
            const max = typeof options?.[`${port}Max`] === 'number' ? options[`${port}Max`] as number : property.max ?? 100;
            const step = property.step ?? 1;
            return <label key={port} className="ae-property-control-axis">
                <span>{property.label}</span>
                <input type="range" min={min} max={max} step={step} value={Number.isFinite(value) ? value : 0}
                    disabled={disabled(key)}
                    onPointerDown={begin}
                    onPointerUp={finish}
                    onPointerCancel={finish}
                    onChange={(event) => {
                        const patch = { [key]: Number(event.target.value) };
                        lastPatch.current = patch;
                        setMany(patch, { id: begin(), finalize: false });
                    }} />
                <output>{Number(value).toFixed(Math.min(3, String(step).split('.')[1]?.length ?? 0))}</output>
            </label>;
        })}
    </fieldset>;
};

const Slider: React.FC<PropertyControlProps> = (props) => <NumericControl {...props} ports={['value']} label={String(props.options?.label ?? props.properties.get(props.bindings.value)?.label ?? 'Value')} />;
const XYPad: React.FC<PropertyControlProps> = (props) => <NumericControl {...props} ports={['x', 'y']} label={String(props.options?.label ?? 'XY control')} />;
const PointGrid: React.FC<PropertyControlProps> = (props) => <NumericControl {...props} ports={['x', 'y']} label={String(props.options?.label ?? 'Point')} />;

const DerivedNumber: React.FC<PropertyControlProps> = ({ bindings, options, properties, values, disabled, setMany }) => {
    const key = bindings.value;
    const property = properties.get(key)!;
    const factor = typeof options?.factor === 'number' && options.factor !== 0 ? options.factor : 1;
    const value = (typeof values[key] === 'number' ? values[key] : Number(property.default ?? 0)) * factor;
    return <label className="ae-property-control ae-property-control-axis">
        <span>{String(options?.label ?? property.label)}</span>
        <input type="number" value={value} step={(property.step ?? 1) * factor} disabled={disabled(key)}
            onChange={(event) => setMany({ [key]: Number(event.target.value) / factor })} />
    </label>;
};

export const propertyControlRegistry = new PropertyControlRegistry();
propertyControlRegistry.register({ id: 'slider', validate: requireNumericPorts(['value']), component: Slider });
propertyControlRegistry.register({ id: 'xy-pad', validate: requireNumericPorts(['x', 'y']), component: XYPad });
propertyControlRegistry.register({ id: 'point-grid', validate: requireNumericPorts(['x', 'y']), component: PointGrid });
propertyControlRegistry.register({ id: 'derived-number', validate: requireNumericPorts(['value']), component: DerivedNumber });
