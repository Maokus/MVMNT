import React from 'react';

interface BooleanInputRowProps {
    id: string;
    value: boolean;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: boolean) => void;
}

const BooleanInputRow: React.FC<BooleanInputRowProps> = ({
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

export default BooleanInputRow;
