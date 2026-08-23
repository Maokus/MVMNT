import { useEffect, useRef } from 'react';
import { resetCommandContextForTest } from '@context/commands/commandContext';
import { hasOpenContextMenu, resetCommandOverlaysForTest } from '@context/commands/commandOverlay';

/** Ownership domains are ordered by their default priority, not DOM position. */
export type ShortcutDomain = 'modal' | 'focused-control' | 'document' | 'undo' | 'transport' | 'timeline' | 'scene';

const DOMAIN_PRIORITY: Record<ShortcutDomain, number> = {
    modal: 700,
    'focused-control': 600,
    document: 500,
    undo: 400,
    transport: 300,
    timeline: 200,
    scene: 100,
};

export interface ShortcutRegistration {
    id: string;
    domain: ShortcutDomain;
    /** Higher values run first within a domain. */
    priority?: number;
    enabled?: boolean;
    matches: (event: KeyboardEvent) => boolean;
    /** Return true only after claiming the event. */
    handle: (event: KeyboardEvent) => boolean | void;
}

type RegisteredShortcut = ShortcutRegistration & { sequence: number };

const registrations = new Map<string, RegisteredShortcut>();
let sequence = 0;
let listening = false;

function orderedRegistrations(): RegisteredShortcut[] {
    return [...registrations.values()].sort((left, right) => {
        const priority =
            DOMAIN_PRIORITY[right.domain] +
            (right.priority ?? 0) -
            (DOMAIN_PRIORITY[left.domain] + (left.priority ?? 0));
        if (priority) return priority;
        // The most recently mounted modal is the topmost overlay.
        if (left.domain === 'modal' && right.domain === 'modal') return right.sequence - left.sequence;
        return left.sequence - right.sequence;
    });
}

function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing || event.key === 'Process') return;
    // Context menus own their navigation and Escape handling at the focused menu element.
    if (hasOpenContextMenu()) return;
    for (const registration of orderedRegistrations()) {
        if (registration.enabled === false || !registration.matches(event)) continue;
        if (registration.handle(event)) return;
    }
}

function startListening() {
    if (listening || typeof window === 'undefined') return;
    window.addEventListener('keydown', onKeyDown, { capture: true });
    listening = true;
}

function stopListening() {
    if (!listening || typeof window === 'undefined') return;
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    listening = false;
}

export function registerGlobalShortcut(registration: ShortcutRegistration): () => void {
    if (registrations.has(registration.id)) {
        throw new Error(`Duplicate global shortcut registration: ${registration.id}`);
    }
    registrations.set(registration.id, { ...registration, sequence: sequence++ });
    startListening();
    return () => {
        registrations.delete(registration.id);
        if (!registrations.size) stopListening();
    };
}

/** Register a live React callback without adding a listener for each component. */
export function useGlobalShortcut(registration: ShortcutRegistration): void {
    const registrationRef = useRef(registration);
    registrationRef.current = registration;
    useEffect(() => {
        return registerGlobalShortcut({
            ...registration,
            enabled: true,
            matches: (event) => registrationRef.current.enabled !== false && registrationRef.current.matches(event),
            handle: (event) => registrationRef.current.handle(event),
        });
        // The ref makes the registration live; only its stable ownership changes require re-registration.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registration.id, registration.domain, registration.priority]);
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || typeof element.closest !== 'function') return false;
    return Boolean(
        element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]')
    );
}

export interface ShortcutChord {
    key?: string;
    code?: string;
    primary?: boolean;
    shift?: boolean;
    alt?: boolean;
    allowRepeat?: boolean;
}

/** Exact, platform-neutral shortcut matching. Unspecified modifiers must be absent. */
export function matchesShortcut(event: KeyboardEvent, chord: ShortcutChord): boolean {
    if (event.repeat && !chord.allowRepeat) return false;
    if (chord.key !== undefined && event.key.toLowerCase() !== chord.key.toLowerCase()) return false;
    if (chord.code !== undefined && event.code !== chord.code) return false;
    const primaryDown = event.metaKey || event.ctrlKey;
    if (primaryDown !== Boolean(chord.primary)) return false;
    if (event.shiftKey !== Boolean(chord.shift)) return false;
    if (event.altKey !== Boolean(chord.alt)) return false;
    return true;
}

export function isNavigationTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return Boolean(
        element &&
        typeof element.closest === 'function' &&
        element.closest('[role="tree"], [role="grid"], [role="listbox"]')
    );
}

/** Test-only reset for module-level registrations created outside React. */
export function resetGlobalShortcutsForTest(): void {
    registrations.clear();
    stopListening();
    sequence = 0;
    resetCommandContextForTest();
    resetCommandOverlaysForTest();
}
