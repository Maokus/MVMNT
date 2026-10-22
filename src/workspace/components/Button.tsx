import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'danger-outline'
    | 'success-outline'
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
    | 'gradient'
    | 'faint'
    | 'icon'
    | 'icon-lg'
    | 'indigo'
    | 'info'
    | 'panel'
    | 'menu'
    | 'list-row';
type ButtonSize = 'sm' | 'md' | 'full';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary: 'rounded bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60',
    secondary:
        'rounded border border-neutral-800 font-medium text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-60',
    danger: 'rounded bg-rose-600 font-medium text-white transition hover:bg-rose-500 disabled:opacity-60',
    'danger-outline':
        'rounded border border-rose-800 font-medium text-rose-200 transition hover:bg-neutral-800 disabled:opacity-60',
    'success-outline':
        'rounded border border-emerald-800 font-medium text-emerald-200 transition hover:bg-neutral-800 disabled:opacity-60',
    ghost: 'rounded border border-transparent font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-60',
    muted: 'rounded border border-neutral-800 font-medium text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60',
    accent: 'rounded border border-neutral-800 bg-neutral-900 font-medium text-emerald-300 transition hover:bg-neutral-800 disabled:opacity-60',
    transport:
        'px-2 py-1 border border-neutral-800 rounded bg-neutral-900 hover:bg-neutral-800 flex items-center gap-1',
    toolbar:
        'flex-1 px-2 py-1 rounded border border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 flex items-center justify-center gap-1',
    quiet: 'bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-200 hover:bg-neutral-800 flex items-center',
    navy: 'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-blue-700 border-blue-800 text-white hover:bg-blue-600',
    neutral:
        'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-800 border-neutral-800 text-neutral-100 hover:bg-neutral-800',
    'solid-blue':
        'rounded border border-blue-800 bg-blue-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-blue-500',
    faint: 'text-xs text-neutral-400 hover:text-neutral-200',
    'solid-emerald':
        'rounded border border-emerald-800 bg-emerald-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-emerald-500',
    'solid-amber':
        'rounded border border-amber-800 bg-amber-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-amber-500',
    // The home page call-to-action gradient, reused wherever a primary-looking action should stand out.
    gradient:
        'rounded bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 font-semibold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:opacity-60',
    icon: 'flex items-center justify-center w-7 h-7 rounded text-neutral-400 hover:text-white hover:bg-neutral-800',
    'icon-lg':
        'flex items-center justify-center w-9 h-9 rounded text-neutral-400 hover:text-white hover:bg-neutral-800',
    indigo: 'rounded bg-indigo-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-indigo-500',
    info: 'rounded bg-sky-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-sky-500',
    panel: 'rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
    menu: 'flex w-full items-center rounded px-2 py-2 text-left text-neutral-200 hover:bg-neutral-800',
    'list-row':
        'flex w-full items-center justify-between rounded px-3 py-2 text-left text-neutral-200 hover:bg-neutral-800',
};

const SIZE_CLASSES: Record<Exclude<ButtonSize, 'full'>, string> = {
    sm: 'px-3 py-1 text-[12px]',
    md: 'px-3 py-1.5 text-[13px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'sm', type, className, children, ...rest },
    ref
) {
    const sizeClasses = size === 'full' ? '' : ` ${SIZE_CLASSES[size]}`;
    const classes = `${VARIANT_CLASSES[variant]}${sizeClasses}${className ? ` ${className}` : ''}`;
    return (
        <button ref={ref} {...rest} type={type ?? 'button'} className={classes}>
            {children}
        </button>
    );
});
