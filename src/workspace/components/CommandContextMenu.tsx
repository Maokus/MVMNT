import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCommandMetadata, getCommandState, executeCommand } from '@context/commands/commandRegistry';
import { markContextMenuOpen } from '@context/commands/commandOverlay';

export interface CommandMenuEntry {
    commandId?: string;
    args?: unknown;
    label?: string;
    shortcut?: string;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    separator?: boolean;
    onSelect?: () => void;
}

interface CommandContextMenuProps {
    position: { x: number; y: number };
    entries: readonly CommandMenuEntry[];
    onClose: () => void;
    ariaLabel?: string;
}

const OPEN_MENU_EVENT = 'mvmnt-context-menu-open';
const VIEWPORT_PADDING = 8;

function displayShortcut(shortcut: string | undefined): string | undefined {
    if (!shortcut) return undefined;
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
    return shortcut
        .replace('Mod', isMac ? '⌘' : 'Ctrl')
        .replaceAll('+Shift', isMac ? '⇧' : '+Shift')
        .replace('+', isMac ? '' : '+');
}

export function CommandContextMenu({
    position,
    entries,
    onClose,
    ariaLabel = 'Context menu',
}: CommandContextMenuProps) {
    const instanceId = useId();
    const menuRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        setAdjustedPosition({
            x: Math.max(VIEWPORT_PADDING, Math.min(position.x, window.innerWidth - rect.width - VIEWPORT_PADDING)),
            y: Math.max(VIEWPORT_PADDING, Math.min(position.y, window.innerHeight - rect.height - VIEWPORT_PADDING)),
        });
        menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }, [position]);

    useEffect(() => {
        const markClosed = markContextMenuOpen(instanceId);
        window.dispatchEvent(new CustomEvent(OPEN_MENU_EVENT, { detail: instanceId }));
        const closeOther = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== instanceId) onClose();
        };
        const closeOutside = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) onClose();
        };
        const closeOnBlur = () => onClose();
        window.addEventListener(OPEN_MENU_EVENT, closeOther);
        window.addEventListener('pointerdown', closeOutside, true);
        window.addEventListener('blur', closeOnBlur);
        return () => {
            markClosed();
            window.removeEventListener(OPEN_MENU_EVENT, closeOther);
            window.removeEventListener('pointerdown', closeOutside, true);
            window.removeEventListener('blur', closeOnBlur);
            openerRef.current?.focus?.({ preventScroll: true });
        };
    }, [instanceId, onClose]);

    const moveFocus = (direction: 1 | -1 | 'first' | 'last') => {
        const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        if (!buttons.length) return;
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
            direction === 'first'
                ? 0
                : direction === 'last'
                  ? buttons.length - 1
                  : (current + direction + buttons.length) % buttons.length;
        buttons[next]?.focus();
    };

    return createPortal(
        <div
            ref={menuRef}
            className="command-context-menu"
            role="menu"
            aria-label={ariaLabel}
            style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (event.key === 'Escape' || event.key === 'Tab') {
                    event.preventDefault();
                    onClose();
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveFocus(1);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveFocus(-1);
                } else if (event.key === 'Home') {
                    event.preventDefault();
                    moveFocus('first');
                } else if (event.key === 'End') {
                    event.preventDefault();
                    moveFocus('last');
                }
                event.stopPropagation();
            }}
        >
            {entries.map((entry, index) => {
                if (entry.separator) return <div className="command-context-menu__separator" key={`sep-${index}`} />;
                const metadata = entry.commandId ? getCommandMetadata(entry.commandId) : undefined;
                const disabled =
                    entry.disabled || (entry.commandId ? !getCommandState(entry.commandId, entry.args).enabled : false);
                const invoke = () => {
                    if (disabled) return;
                    if (entry.commandId) executeCommand(entry.commandId, entry.args);
                    else entry.onSelect?.();
                    onClose();
                };
                return (
                    <button
                        key={`${entry.commandId ?? entry.label}-${index}`}
                        type="button"
                        role="menuitem"
                        className={entry.danger ? 'is-danger' : undefined}
                        disabled={disabled}
                        onClick={invoke}
                    >
                        {entry.icon}
                        <span>{entry.label ?? metadata?.title ?? entry.commandId}</span>
                        {displayShortcut(entry.shortcut ?? metadata?.defaultShortcut) ? (
                            <kbd>{displayShortcut(entry.shortcut ?? metadata?.defaultShortcut)}</kbd>
                        ) : null}
                    </button>
                );
            })}
        </div>,
        document.body
    );
}
