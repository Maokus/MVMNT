import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'ghost'
    | 'muted'
    | 'accent'
    | 'transport'
    | 'toolbar'
    | 'quiet'
    | 'navy'
    | 'neutral'
    | 'solid-blue'
    | 'solid-emerald'
    | 'solid-amber'
    | 'faint'
    | 'icon'
    | 'indigo'
    | 'info'
    | 'panel';
type ButtonSize = 'sm' | 'md' | 'full';

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
    ghost: 'rounded border border-transparent font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60',
    muted: 'rounded border border-neutral-700 font-medium text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60',
    accent: 'rounded border border-emerald-400/60 bg-emerald-500/20 font-medium text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-60',
    transport:
        'px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1',
    toolbar:
        'flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1',
    quiet: 'bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-300 hover:bg-[color:var(--twc-border)] flex items-center',
    navy: 'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-[#0e639c] border-[#1177bb] text-white hover:bg-[#1177bb] hover:border-[#1890d4]',
    neutral:
        'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-600 border-neutral-500 text-neutral-100 hover:bg-neutral-500 hover:border-neutral-400',
    'solid-blue':
        'rounded border border-blue-500/70 bg-blue-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-500',
    faint: 'text-xs opacity-70 hover:opacity-100',
    'solid-emerald':
        'rounded border border-emerald-500/70 bg-emerald-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500',
    'solid-amber':
        'rounded border border-amber-500/70 bg-amber-600/70 px-3 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-amber-500',
    icon: 'flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50',
    indigo: 'rounded bg-indigo-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-indigo-500',
    info: 'rounded bg-sky-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-sky-500',
    panel: 'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
};

const SIZE_CLASSES: Record<Exclude<ButtonSize, 'full'>, string> = {
    sm: 'px-3 py-1 text-[12px]',
    md: 'px-3 py-1.5 text-[13px]',
};

export function Button({ variant = 'secondary', size = 'sm', type, className, children, ...rest }: ButtonProps) {
    const sizeClasses = size === 'full' ? '' : ` ${SIZE_CLASSES[size]}`;
    const classes = `${VARIANT_CLASSES[variant]}${sizeClasses}${className ? ` ${className}` : ''}`;
    return (
        <button {...rest} type={type ?? 'button'} className={classes}>
            {children}
        </button>
    );
}
