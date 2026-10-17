import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button, type ButtonProps } from '../Button';

// Pins the flat contract: each catalog variant renders its exact class
// string (flat, solid, shadow-free).
type ButtonVariant = NonNullable<ButtonProps['variant']>;
const VARIANT_CASES: Array<[ButtonVariant, string]> = [
    [
        'transport',
        'px-2 py-1 border border-neutral-800 rounded bg-neutral-900 hover:bg-neutral-800 flex items-center gap-1',
    ],
    [
        'toolbar',
        'flex-1 px-2 py-1 rounded border border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 flex items-center justify-center gap-1',
    ],
    [
        'quiet',
        'bg-transparent border-0 text-neutral-400 cursor-pointer px-1 py-0.5 rounded text-xs hover:text-neutral-200 hover:bg-neutral-800 flex items-center',
    ],
    [
        'navy',
        'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-blue-700 border-blue-800 text-white hover:bg-blue-600',
    ],
    [
        'neutral',
        'px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-800 border-neutral-800 text-neutral-100 hover:bg-neutral-800',
    ],
    [
        'solid-blue',
        'rounded border border-blue-800 bg-blue-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-blue-500',
    ],
    [
        'solid-emerald',
        'rounded border border-emerald-800 bg-emerald-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-emerald-500',
    ],
    [
        'solid-amber',
        'rounded border border-amber-800 bg-amber-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-amber-500',
    ],
    ['faint', 'text-xs text-neutral-400 hover:text-neutral-200'],
    [
        'icon-lg',
        'flex items-center justify-center w-9 h-9 rounded text-neutral-400 hover:text-white hover:bg-neutral-800',
    ],
    ['icon', 'flex items-center justify-center w-7 h-7 rounded text-neutral-400 hover:text-white hover:bg-neutral-800'],
    ['indigo', 'rounded bg-indigo-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-indigo-500'],
    ['info', 'rounded bg-sky-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-sky-500'],
    [
        'panel',
        'rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
    ],
    [
        'danger-outline',
        'rounded border border-rose-800 font-medium text-rose-200 transition hover:bg-neutral-800 disabled:opacity-60',
    ],
    [
        'success-outline',
        'rounded border border-emerald-800 font-medium text-emerald-200 transition hover:bg-neutral-800 disabled:opacity-60',
    ],
    ['menu', 'flex w-full items-center rounded px-2 py-2 text-left text-neutral-200 hover:bg-neutral-800'],
    [
        'list-row',
        'flex w-full items-center justify-between rounded px-3 py-2 text-left text-neutral-200 hover:bg-neutral-800',
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

    it('has no translucency, glow, or shadow tokens', () => {
        for (const [, classes] of VARIANT_CASES) {
            expect(classes).not.toMatch(/\/50|\/60|\/70|\/95|shadow-|backdrop-blur|gradient/);
        }
    });
});
