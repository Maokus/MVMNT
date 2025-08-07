import React, { useState, useEffect } from 'react';

interface NumberInputRowProps {
    id: string;
    value: number;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: number) => void;
}

const NumberInputRow: React.FC<NumberInputRowProps> = ({
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
        const displayValue = typeof value === 'number' && !isNaN(value) ? value.toString() :
            (typeof schema.default === 'number' ? schema.default.toString() : '0');
        setLocalValue(displayValue);
    }, [value, schema.default]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setLocalValue(inputValue);

        if (inputValue === '' || inputValue === '-') {
            // Allow empty value or minus sign during editing, but don't call onChange yet
            return;
        }

        const numValue = parseFloat(inputValue);
        if (!isNaN(numValue)) {
            onChange(numValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur(); // This will deselect the input
        }
    };

    return (
        <input
            type="number"
            id={id}
            value={localValue}
            min={schema.min}
            max={schema.max}
            step={schema.step}
            disabled={disabled}
            title={title}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
        />
    );
};

export default NumberInputRow;
