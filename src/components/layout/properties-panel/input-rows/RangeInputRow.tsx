import React from 'react';

interface RangeInputRowProps {
    id: string;
    value: number;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: number) => void;
}

const RangeInputRow: React.FC<RangeInputRowProps> = ({
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
        <div className="range-input-container">
            <input
                type="range"
                id={id}
                value={value || schema.default || 0}
                min={schema.min}
                max={schema.max}
                step={schema.step}
                disabled={disabled}
                title={title}
                onChange={handleChange}
            />
        </div>
    );
};

export default RangeInputRow;
