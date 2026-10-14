import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, type ButtonProps } from '../Button';

// Pins the flat contract: each catalog variant renders its exact class
// string (shadow-free since the flat-UI pass).
type ButtonVariant = NonNullable<ButtonProps['variant']>;
const VARIANT_CASES: Array<[ButtonVariant, string]> = [
    [
        'transport',
        'px-2 py-1 border border-neutral-700 rounded bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1',
    ],
    [
        'toolbar',
        'flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1',
    ],
    [
        'quiet',
        'bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-300 hover:bg-[color:var(--twc-border)] flex items-center',
    ],
    [
        'navy',
        'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-[#0e639c] border-[#1177bb] text-white hover:bg-[#1177bb] hover:border-[#1890d4]',
    ],
    [
        'neutral',
        'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-600 border-neutral-500 text-neutral-100 hover:bg-neutral-500 hover:border-neutral-400',
    ],
    [
        'solid-blue',
        'rounded border border-blue-500/70 bg-blue-600/70 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-blue-500',
    ],
    [
        'solid-emerald',
        'rounded border border-emerald-500/70 bg-emerald-600/70 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-emerald-500',
    ],
    [
        'solid-amber',
        'rounded border border-amber-500/70 bg-amber-600/70 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-amber-500',
    ],
    ['faint', 'text-xs opacity-70 hover:opacity-100'],
    [
        'icon',
        'flex items-center justify-center w-4 h-4 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50',
    ],
    ['indigo', 'rounded bg-indigo-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-indigo-500'],
    ['info', 'rounded bg-sky-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-sky-500'],
    [
        'panel',
        'rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
    ],
];

describe('Button catalog', () => {
    afterEach(() => {
        cleanup();
    });

    it.each(VARIANT_CASES)('variant %s renders its exact migrated classes', (variant, classes) => {
        const label = `btn-${variant}`;
        render(
            <Button variant={variant} size="full">
                {label}
            </Button>
        );
        // eslint-disable-next-line testing-library/no-node-access
        const button = screen.getByRole('button', { name: label });
        for (const cls of classes.split(' ')) {
            expect(button.className.split(' ')).toContain(cls);
        }
        expect(button.className.split(' ').sort()).toEqual(classes.split(' ').sort());
    });
});
