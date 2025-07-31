import React from 'react';

interface NumberInputProps {
    id: string;
    value: number;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: number) => void;
}

const NumberInput: React.FC<NumberInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const numValue = parseFloat(e.target.value);
        if (!isNaN(numValue)) {
            onChange(numValue);
        }
    };

    return (
        <input
            type="number"
            id={id}
            value={value || schema.default || 0}
            min={schema.min}
            max={schema.max}
            step={schema.step}
            disabled={disabled}
            title={title}
            onChange={handleChange}
        />
    );
};

export default NumberInput;
