import React, { useCallback, useEffect, useRef, useState } from 'react';
import FileInput from './FileInput';
import FontInput from './FontInput';
import TimelineTrackSelect from './TimelineTrackSelect';
import { AudioAnalysisProfileSelect } from './AudioAnalysisProfileSelect';
import { useNumberDrag } from './useNumberDrag';

export interface FormInputChangeMeta {
    mergeSession?: {
        id: string;
        finalize: boolean;
    };
    linkedUpdates?: Record<string, any>;
}

export interface FormInputChange {
    value: any;
    meta?: FormInputChangeMeta;
}

interface FormInputProps {
    id: string;
    type: string;
    value: any;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: any | FormInputChange) => void;
}

const FormInput: React.FC<FormInputProps> = ({ id, type, value, schema, disabled = false, title, onChange }) => {
    // Local state helpers for text/number inputs to avoid wiping while typing
    const [localValue, setLocalValue] = useState<string>('');
    const lastNonEmptyValueRef = useRef<string>('');
    const isNumberType = type === 'number';

    const getCurrentNumberValue = useCallback(() => {
        if (typeof value === 'number' && !isNaN(value)) return value;
        const parsed = parseFloat(localValue);
        if (!isNaN(parsed)) return parsed;
        const defaultValue = typeof schema?.default === 'number' ? schema.default : 0;
        return defaultValue;
    }, [localValue, schema?.default, value]);

    const emitChange = useCallback(
        (nextValue: any, meta?: FormInputChangeMeta) => {
            if (meta) {
                onChange({ value: nextValue, meta });
            } else {
                onChange(nextValue);
            }
        },
        [onChange],
    );

    const numberDragHandlers = useNumberDrag({
        disabled: disabled || !isNumberType,
        step: typeof schema?.step === 'number' ? schema.step : undefined,
        min: typeof schema?.min === 'number' ? schema.min : undefined,
        max: typeof schema?.max === 'number' ? schema.max : undefined,
        getCurrentValue: getCurrentNumberValue,
        onPreview: (next) => {
            setLocalValue(next.toString());
        },
        onChange: (next, meta) => {
            emitChange(next, meta
                ? {
                      mergeSession: {
                          id: meta.sessionId,
                          finalize: meta.finalize,
                      },
                  }
                : undefined);
        },
    });

    useEffect(() => {
        if (type === 'number') {
            const displayValue = typeof value === 'number' && !isNaN(value) ? value.toString() :
                (typeof schema?.default === 'number' ? schema.default.toString() : '0');
            setLocalValue(displayValue);
        } else if (type === 'string' || type === 'text') {
            const displayValue = typeof value === 'string' ? value : (typeof schema?.default === 'string' ? schema.default : '');
            setLocalValue(displayValue);
            if (displayValue.trim().length > 0) {
                lastNonEmptyValueRef.current = displayValue;
            }
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
            if (!isNaN(numValue)) emitChange(numValue);
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
            if (!isNaN(numValue)) emitChange(numValue);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') e.currentTarget.blur();
        };

        return (
            <input
                type="number"
                id={id}
                value={localValue}
                min={schema?.min}
                max={schema?.max}
                step={schema?.step}
                disabled={disabled}
                title={title}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPointerDown={numberDragHandlers.onPointerDown}
                onPointerMove={numberDragHandlers.onPointerMove}
                onPointerUp={numberDragHandlers.onPointerUp}
                onPointerCancel={numberDragHandlers.onPointerCancel}
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

    if (type === 'timelineTrackRef') {
        return (
            <TimelineTrackSelect
                id={id}
                value={value ?? null}
                schema={schema}
                disabled={disabled}
                title={title}
                onChange={onChange}
            />
        );
    }

    if (type === 'audioAnalysisProfile') {
        return (
            <AudioAnalysisProfileSelect
                id={id}
                value={typeof value === 'string' ? value : null}
                schema={schema}
                disabled={disabled}
                title={title}
                onChange={onChange}
            />
        );
    }

    // default: text/string
    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        emitChange(newValue);
        if (newValue.trim().length > 0) {
            lastNonEmptyValueRef.current = newValue;
        }
    };

    const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
    };

    const handleTextBlur = () => {
        if (localValue.trim().length > 0) {
            return;
        }

        const fallbackFromHistory = lastNonEmptyValueRef.current;
        const schemaDefault = typeof schema?.default === 'string' ? schema.default : '';
        const nextValue = fallbackFromHistory.trim().length > 0 ? fallbackFromHistory : schemaDefault;

        if (nextValue !== localValue) {
            setLocalValue(nextValue);
            emitChange(nextValue);
        }

        if (nextValue.trim().length > 0) {
            lastNonEmptyValueRef.current = nextValue;
        }
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
            onBlur={handleTextBlur}
        />
    );
};

export default FormInput;
