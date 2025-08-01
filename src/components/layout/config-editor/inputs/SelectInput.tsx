import React from 'react';

interface SelectInputProps {
    id: string;
    value: string;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: string) => void;
}

const SelectInput: React.FC<SelectInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange
}) => {
    return (
        <select
            id={id}
            value={value}
            disabled={disabled}
            title={title}
            onChange={(e) => onChange(e.target.value)}
        >
            {schema.options?.map((option: any) => (
                <option key={option.value} value={option.value}>
                    {option.label || option.value}
                </option>
            ))}
        </select>
    );
};

export default SelectInput;
