import React, { useEffect, useRef, useState } from 'react';
import FileInput from './FileInput';
import FontInput from './FontInput';
import MidiTrackSelect from './MidiTrackSelect';

function getStepDecimals(step: number): number {
    if (!isFinite(step) || step <= 0) return 0;
    const str = step.toString();
    if (str.includes('e-')) {
        const match = /e-(\d+)/.exec(str);
        return match ? parseInt(match[1], 10) : 0;
    }
    const parts = str.split('.');
    return parts[1]?.length ?? 0;
}

interface FormInputProps {
    id: string;
    type: string;
    value: any;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: any) => void;
}

const FormInput: React.FC<FormInputProps> = ({ id, type, value, schema, disabled = false, title, onChange }) => {
    // Local state helpers for text/number inputs to avoid wiping while typing
    const [localValue, setLocalValue] = useState<string>('');
    const numberDragStateRef = useRef<
        | null
        | {
              pointerId: number;
              startY: number;
              startValue: number;
              step: number;
              min?: number;
              max?: number;
              decimals: number;
              lastValue: number;
              prevCursor: string;
              prevUserSelect: string;
          }
    >(null);
    const numberInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (type === 'number') {
            const displayValue = typeof value === 'number' && !isNaN(value) ? value.toString() :
                (typeof schema?.default === 'number' ? schema.default.toString() : '0');
            setLocalValue(displayValue);
        } else if (type === 'string' || type === 'text') {
            const displayValue = typeof value === 'string' ? value : (typeof schema?.default === 'string' ? schema.default : '');
            setLocalValue(displayValue);
        }
    }, [value, schema?.default, type]);

    if (type === 'boolean') {
        return (
            <input
                type="checkbox"
                id={id}
                checked={Boolean(value)}
                disabled={disabled}
                title={title}
                onChange={(e) => onChange(e.target.checked)}
            />
        );
    }

    if (type === 'color') {
        return (
            <input
                type="color"
                id={id}
                value={value || schema?.default || '#000000'}
                disabled={disabled}
                title={title}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    }

    if (type === 'select') {
        return (
            <select
                id={id}
                value={value}
                disabled={disabled}
                title={title}
                onChange={(e) => onChange(e.target.value)}
            >
                {schema?.options?.map((option: any) => (
                    <option key={option.value} value={option.value}>
                        {option.label || option.value}
                    </option>
                ))}
            </select>
        );
    }

    if (type === 'range') {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const numValue = parseFloat(e.target.value);
            if (!isNaN(numValue)) onChange(numValue);
        };

        return (
            <div className="range-input-container">
                <input
                    type="range"
                    id={id}
                    value={value ?? schema?.default ?? 0}
                    min={schema?.min}
                    max={schema?.max}
                    step={schema?.step}
                    disabled={disabled}
                    title={title}
                    onChange={handleChange}
                />
            </div>
        );
    }

    if (type === 'number') {
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const inputValue = e.target.value;
            setLocalValue(inputValue);

            if (inputValue === '' || inputValue === '-') return;

            const numValue = parseFloat(inputValue);
            if (!isNaN(numValue)) onChange(numValue);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') e.currentTarget.blur();
        };

        const handlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
            if (!e.altKey || disabled) return;
            const currentValue = typeof value === 'number' && !isNaN(value)
                ? value
                : (() => {
                      const parsed = parseFloat(localValue);
                      return !isNaN(parsed) ? parsed : 0;
                  })();
            const rawStep = typeof schema?.step === 'number' && isFinite(schema.step) && schema.step > 0 ? schema.step : 1;
            const decimals = getStepDecimals(rawStep);
            const min = typeof schema?.min === 'number' ? schema.min : undefined;
            const max = typeof schema?.max === 'number' ? schema.max : undefined;
            numberDragStateRef.current = {
                pointerId: e.pointerId,
                startY: e.clientY,
                startValue: currentValue,
                step: rawStep,
                min,
                max,
                decimals,
                lastValue: currentValue,
                prevCursor: document.body.style.cursor,
                prevUserSelect: document.body.style.userSelect,
            };
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
            e.preventDefault();
        };

        const handlePointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
            const drag = numberDragStateRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            const deltaY = drag.startY - e.clientY;
            const modifier = e.shiftKey ? 5 : e.ctrlKey || e.metaKey ? 0.1 : 1;
            const baseStep = drag.step || 1;
            let next = drag.startValue + deltaY * baseStep * modifier;
            if (baseStep > 0) {
                const stepped = Math.round(next / baseStep) * baseStep;
                next = drag.decimals > 0 ? parseFloat(stepped.toFixed(drag.decimals)) : stepped;
            }
            if (drag.min !== undefined) next = Math.max(drag.min, next);
            if (drag.max !== undefined) next = Math.min(drag.max, next);
            if (!isFinite(next) || next === drag.lastValue) return;
            drag.lastValue = next;
            setLocalValue(next.toString());
            onChange(next);
        };

        const finishPointerDrag = (target: EventTarget | null, pointerId: number) => {
            const drag = numberDragStateRef.current;
            if (!drag || drag.pointerId !== pointerId) return;
            numberDragStateRef.current = null;
            document.body.style.cursor = drag.prevCursor;
            document.body.style.userSelect = drag.prevUserSelect;
            try {
                (target as HTMLElement | null)?.releasePointerCapture(pointerId);
            } catch {}
        };

        const handlePointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
            finishPointerDrag(e.currentTarget, e.pointerId);
        };

        const handlePointerCancel = (e: React.PointerEvent<HTMLInputElement>) => {
            finishPointerDrag(e.currentTarget, e.pointerId);
        };

        return (
            <input
                type="number"
                id={id}
                ref={numberInputRef}
                value={localValue}
                min={schema?.min}
                max={schema?.max}
                step={schema?.step}
                disabled={disabled}
                title={title}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
            />
        );
    }

    if (type === 'file') {
        return (
            <FileInput
                id={id}
                value={value}
                schema={schema}
                disabled={disabled}
                title={title}
                onChange={onChange}
            />
        );
    }

    if (type === 'font') {
        // Delegate to the specialized font input component kept in a separate file
        return (
            <FontInput id={id} value={value} schema={schema} disabled={disabled} title={title} onChange={onChange} />
        );
    }

    if (type === 'midiTrackRef') {
        return (
            <MidiTrackSelect id={id} value={value ?? null} schema={schema} disabled={disabled} title={title} onChange={onChange} />
        );
    }

    // default: text/string
    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        onChange(newValue);
    };

    const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
    };

    return (
        <input
            type="text"
            id={id}
            value={localValue}
            disabled={disabled}
            title={title}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
        />
    );
};

export default FormInput;
