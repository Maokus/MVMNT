import React from 'react';

interface ColorInputProps {
    id: string;
    value: string;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const ColorInput: React.FC<ColorInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange
}) => {
    return (
        <input
            type="color"
            id={id}
            value={value || schema.default || '#000000'}
            disabled={disabled}
            title={title}
            onChange={(e) => onChange(e.target.value)}
        />
    );
};

export default ColorInput;
