import React from 'react';

export const inputCls = 'bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm';

interface FormFieldProps {
    label: string;
    span2?: boolean;
    hint?: string;
    children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({ label, span2, hint, children }) => (
    <label className={`flex flex-col gap-1${span2 ? ' col-span-2' : ''}`}>
        {label}
        {children}
        {hint && <span className="text-[10px] opacity-60">{hint}</span>}
    </label>
);
