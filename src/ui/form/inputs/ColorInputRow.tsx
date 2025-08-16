import React from 'react';

interface ColorInputRowProps {
    id: string;
    value: string;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const ColorInputRow: React.FC<ColorInputRowProps> = ({
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

export default ColorInputRow;
