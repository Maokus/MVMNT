import React from 'react';

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
    return (
        <input
            type="text"
            id={id}
            value={value || schema.default || ''}
            disabled={disabled}
            title={title}
            onChange={(e) => onChange(e.target.value)}
        />
    );
};

export default TextInput;
