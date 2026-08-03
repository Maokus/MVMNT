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
    /** Presentation only; serialized schemas continue to reference controls by ID. */
    presentation: 'inline' | 'block';
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

const requireNumericPorts =
    (ports: string[]) => (bindings: Record<string, string>, properties: Map<string, PropertyDefinition>) => {
        for (const port of ports) {
            const key = bindings[port];
            const property = key ? properties.get(key) : undefined;
            if (!property) return `missing ${port} binding`;
            if (property.type !== 'number') return `${key} must be numeric`;
        }
        return null;
    };

/**
 * Returns the display range for a numeric layout port. Single-value controls
 * use `min`, `max`, and `step`; multi-value controls use port-prefixed names
 * such as `xMin`, `xMax`, and `xStep`. Property metadata remains the fallback
 * so layouts only need to specify values they deliberately override.
 */
const numericLayoutOption = (
    options: Record<string, unknown> | undefined,
    port: string,
    name: 'min' | 'max' | 'step'
): number | undefined => {
    const optionName = port === 'value' ? name : `${port}${name[0].toUpperCase()}${name.slice(1)}`;
    // `valueMin`/`valueMax` were accepted by the first layout implementation.
    // Preserve them for existing schemas while standardizing single-value
    // controls on the more ergonomic unprefixed names.
    const value =
        options?.[optionName] ??
        (port === 'value' ? options?.[`value${name[0].toUpperCase()}${name.slice(1)}`] : undefined);
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const NumericControl: React.FC<PropertyControlProps & { ports: string[]; label: string }> = ({
    bindings,
    options,
    properties,
    values,
    disabled,
    setMany,
    ports,
    label,
}) => {
    const session = React.useRef<string | null>(null);
    const lastPatch = React.useRef<Record<string, unknown>>({});
    const begin = () =>
        (session.current ??= `property-control-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
    const finish = () => {
        if (!session.current) return;
        setMany(lastPatch.current, { id: session.current, finalize: true });
        session.current = null;
        lastPatch.current = {};
    };
    const hasGroupLegend = ports.length > 1;
    return (
        <fieldset className="ae-property-control" aria-label={label}>
            {hasGroupLegend && <legend>{label}</legend>}
            {ports.map((port) => {
                const key = bindings[port];
                const property = properties.get(key)!;
                const value = typeof values[key] === 'number' ? values[key] : Number(property.default ?? 0);
                const min = numericLayoutOption(options, port, 'min') ?? property.min ?? 0;
                const max = numericLayoutOption(options, port, 'max') ?? property.max ?? 100;
                const step = numericLayoutOption(options, port, 'step') ?? property.step ?? 1;
                return (
                    <label key={port} className="ae-property-control-axis">
                        <span>{property.label}</span>
                        <input
                            type="range"
                            min={min}
                            max={max}
                            step={step}
                            value={Number.isFinite(value) ? value : 0}
                            disabled={disabled(key)}
                            onPointerDown={begin}
                            onPointerUp={finish}
                            onPointerCancel={finish}
                            onChange={(event) => {
                                const patch = { [key]: Number(event.target.value) };
                                lastPatch.current = patch;
                                setMany(patch, { id: begin(), finalize: false });
                            }}
                        />
                        <output>{Number(value).toFixed(Math.min(3, String(step).split('.')[1]?.length ?? 0))}</output>
                    </label>
                );
            })}
        </fieldset>
    );
};

const Slider: React.FC<PropertyControlProps> = (props) => (
    <NumericControl
        {...props}
        ports={['value']}
        label={String(props.options?.label ?? props.properties.get(props.bindings.value)?.label ?? 'Value')}
    />
);
const XYPad: React.FC<PropertyControlProps> = (props) => (
    <NumericControl {...props} ports={['x', 'y']} label={String(props.options?.label ?? 'XY control')} />
);
const PointGrid: React.FC<PropertyControlProps> = (props) => (
    <NumericControl {...props} ports={['x', 'y']} label={String(props.options?.label ?? 'Point')} />
);

const AnchorGrid: React.FC<PropertyControlProps> = ({ bindings, options, values, disabled, setMany }) => {
    const xKey = bindings.x;
    const yKey = bindings.y;
    const x = typeof values[xKey] === 'number' ? values[xKey] : 0.5;
    const y = typeof values[yKey] === 'number' ? values[yKey] : 0.5;
    const isDisabled = disabled(xKey) || disabled(yKey);
    const positions = [
        ['Top left', 0, 0],
        ['Top center', 0.5, 0],
        ['Top right', 1, 0],
        ['Center left', 0, 0.5],
        ['Center', 0.5, 0.5],
        ['Center right', 1, 0.5],
        ['Bottom left', 0, 1],
        ['Bottom center', 0.5, 1],
        ['Bottom right', 1, 1],
    ] as const;
    return (
        <fieldset className="ae-property-control ae-anchor-grid" aria-label={String(options?.label ?? 'Anchor')}>
            <legend>{String(options?.label ?? 'Anchor')}</legend>
            <div className="ae-anchor-grid-buttons">
                {positions.map(([label, nextX, nextY]) => (
                    <button
                        key={label}
                        type="button"
                        className="ae-anchor-grid-dot"
                        aria-label={label}
                        aria-pressed={x === nextX && y === nextY}
                        disabled={isDisabled}
                        onClick={() => setMany({ [xKey]: nextX, [yKey]: nextY })}
                    >
                        <span aria-hidden="true" />
                    </button>
                ))}
            </div>
        </fieldset>
    );
};

const DerivedNumber: React.FC<PropertyControlProps> = ({
    bindings,
    options,
    properties,
    values,
    disabled,
    setMany,
}) => {
    const key = bindings.value;
    const property = properties.get(key)!;
    const factor = typeof options?.factor === 'number' && options.factor !== 0 ? options.factor : 1;
    const value = (typeof values[key] === 'number' ? values[key] : Number(property.default ?? 0)) * factor;
    return (
        <label className="ae-property-control ae-property-control-axis">
            <span>{String(options?.label ?? property.label)}</span>
            <input
                type="number"
                value={value}
                step={(property.step ?? 1) * factor}
                disabled={disabled(key)}
                onChange={(event) => setMany({ [key]: Number(event.target.value) / factor })}
            />
        </label>
    );
};

export const propertyControlRegistry = new PropertyControlRegistry();
propertyControlRegistry.register({
    id: 'slider',
    presentation: 'block',
    validate: requireNumericPorts(['value']),
    component: Slider,
});
propertyControlRegistry.register({
    id: 'xy-pad',
    presentation: 'block',
    validate: requireNumericPorts(['x', 'y']),
    component: XYPad,
});
propertyControlRegistry.register({
    id: 'point-grid',
    presentation: 'block',
    validate: requireNumericPorts(['x', 'y']),
    component: PointGrid,
});
propertyControlRegistry.register({
    id: 'anchor-grid',
    presentation: 'block',
    validate: requireNumericPorts(['x', 'y']),
    component: AnchorGrid,
});
propertyControlRegistry.register({
    id: 'derived-number',
    presentation: 'inline',
    validate: requireNumericPorts(['value']),
    component: DerivedNumber,
});
