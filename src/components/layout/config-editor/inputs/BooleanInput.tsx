import React from 'react';

interface BooleanInputProps {
    id: string;
    value: boolean;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: boolean) => void;
}

const BooleanInput: React.FC<BooleanInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange
}) => {
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
};

export default BooleanInput;
