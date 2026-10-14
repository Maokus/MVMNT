import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary:
        'rounded bg-blue-500 font-semibold text-white shadow-sm transition-colors hover:bg-blue-400 disabled:opacity-60',
    secondary:
        'rounded border border-neutral-600 font-medium text-neutral-300 transition hover:bg-white/10 disabled:opacity-60',
    danger: 'rounded bg-rose-600 font-medium text-white transition hover:bg-rose-500 disabled:opacity-60',
    ghost: 'rounded text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-3 py-1 text-[12px]',
    md: 'px-3 py-1.5 text-[13px]',
};

export function Button({ variant = 'secondary', size = 'sm', type, className, children, ...rest }: ButtonProps) {
    const classes = `${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}${className ? ` ${className}` : ''}`;
    return (
        <button {...rest} type={type ?? 'button'} className={classes}>
            {children}
        </button>
    );
}
