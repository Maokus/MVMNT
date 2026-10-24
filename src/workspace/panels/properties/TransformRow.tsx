import React from 'react';
import FormInput, { type FormInputChange } from '@workspace/forms/inputs/FormInput';
import { parseNumberInput } from '@workspace/forms/inputs/numberInput';
import { PropertyControlRow } from './PropertyControlRow';
import { hoveredPropertyRef } from './hoveredPropertyRef';
import { readFiniteTransformInput } from './nodeTransformInput';

export interface TransformRowProps {
    label: string;
    id: string;
    value: number;
    schema?: Record<string, unknown>;
    suffix?: string;
    readOnly?: boolean;
    mixed?: boolean;
    onChange?: (value: number, change?: FormInputChange) => void;
    automation?: React.ReactNode;
    macro?: React.ReactNode;
    uncommitted?: boolean;
    hoverProperty?: { owner: { kind: 'node'; id: string }; propertyKey: string; propertyType: string };
}

export function TransformRow({
    label,
    id,
    value,
    schema,
    suffix,
    readOnly,
    mixed,
    onChange,
    automation,
    macro,
    uncommitted = false,
    hoverProperty,
}: TransformRowProps) {
    return (
        <PropertyControlRow
            label={suffix ? `${label} (${suffix})` : label}
            animationControl={automation}
            macroControl={macro}
            className={uncommitted ? 'ae-property-uncommitted' : undefined}
            onMouseEnter={
                hoverProperty
                    ? () => {
                          hoveredPropertyRef.current = hoverProperty;
                      }
                    : undefined
            }
            onMouseLeave={
                hoverProperty
                    ? () => {
                          if (
                              hoveredPropertyRef.current?.owner.kind === 'node' &&
                              hoveredPropertyRef.current.owner.id === hoverProperty.owner.id &&
                              hoveredPropertyRef.current.propertyKey === hoverProperty.propertyKey
                          )
                              hoveredPropertyRef.current = null;
                      }
                    : undefined
            }
        >
            {mixed ? (
                <input
                    className="node-transform-mixed"
                    defaultValue=""
                    placeholder="Mixed"
                    disabled={readOnly}
                    onBlur={(event) => {
                        const next = parseNumberInput(event.currentTarget.value);
                        if (next !== null) onChange?.(next);
                        event.currentTarget.value = '';
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                />
            ) : (
                <FormInput
                    id={id}
                    type="number"
                    value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
                    schema={schema ?? { step: 1 }}
                    disabled={readOnly}
                    onChange={(change) => {
                        const next = readFiniteTransformInput(change);
                        if (next != null) onChange?.(next, change as FormInputChange);
                    }}
                />
            )}
        </PropertyControlRow>
    );
}
