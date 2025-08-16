import React, { useEffect, useRef, useState } from 'react';

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
            />
        );
    }

    if (type === 'file') {
        const [preview, setPreview] = useState<string | null>(null);
        const [currentFileName, setCurrentFileName] = useState<string>('');
        const fileInputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            if (value) {
                if (typeof value === 'string' && value.startsWith('data:')) {
                    if (value.startsWith('data:image')) {
                        setPreview(value);
                        setCurrentFileName('Current: Base64 image');
                    } else {
                        setCurrentFileName('Current: Base64 file');
                    }
                } else if (typeof value === 'string') {
                    setCurrentFileName(`Current: ${value}`);
                } else if (value instanceof File) {
                    setCurrentFileName(`Current: ${value.name}`);
                }
            } else {
                if (schema?.accept && schema.accept.includes('.mid')) {
                    setCurrentFileName('No MIDI file selected');
                } else {
                    setCurrentFileName('No file selected');
                }
                setPreview(null);
            }
        }, [value, schema?.accept]);

        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (schema?.accept && schema.accept.includes('.mid')) {
                setCurrentFileName(`Selected: ${file.name}`);
                setPreview(null);
                onChange(file);
            } else {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const base64 = ev.target?.result as string;
                    setPreview(base64);
                    setCurrentFileName(`Selected: ${file.name}`);
                    onChange(base64);
                };
                reader.readAsDataURL(file);
            }
        };

        const getLabelText = () => {
            if (schema?.accept && schema.accept.includes('.mid')) return 'Choose MIDI File';
            if (schema?.accept && schema.accept.includes('image')) return 'Choose Image';
            return 'Choose File';
        };

        return (
            <div className="file-input-container">
                <label
                    className="file-input-label"
                    htmlFor={id}
                    style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.6 : 1 }}
                >
                    {getLabelText()}
                </label>

                <input
                    ref={fileInputRef}
                    type="file"
                    id={id}
                    accept={schema?.accept || '*/*'}
                    disabled={disabled}
                    title={title}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />

                <div className="current-file">{currentFileName}</div>

                <div className="file-preview">
                    {preview && (
                        <img
                            src={preview}
                            alt="Preview"
                            style={{ maxWidth: '100px', maxHeight: '100px', objectFit: 'contain' }}
                        />
                    )}
                </div>
            </div>
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
