import React, { useState, useEffect } from 'react';

interface TextInputProps {
    id: string;
    value: string;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const TextInput: React.FC<TextInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange
}) => {
    // Use local state for the input value to prevent it from being reset during typing
    const [localValue, setLocalValue] = useState<string>('');

    // Initialize local value when the prop value changes (new element selected)
    useEffect(() => {
        const displayValue = typeof value === 'string' ? value :
            (typeof schema.default === 'string' ? schema.default : '');
        setLocalValue(displayValue);
    }, [value, schema.default]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        onChange(newValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur(); // This will deselect the input
        }
    };

    return (
        <input
            type="text"
            id={id}
            value={localValue}
            disabled={disabled}
            title={title}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
        />
    );
};

export default TextInput;
